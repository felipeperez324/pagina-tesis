
import type { APIRoute } from "astro";

import { db } from "../../../lib/db";
import { getUsuarioDesdeSesion } from "../../../lib/auth";

import {
  validarImagen,
  subirImagen,
  borrarImagen,
  ErrorImagen
} from "../../../lib/azure";

import {
  PERSONALIDADES,
  ANTECEDENTES_MEDICOS,
  procesarClasificacion
} from "../../../lib/CatalogoMatch";

export const prerender = false;

function responder(
  datos: Record<string, unknown>,
  status = 200
) {
  return new Response(JSON.stringify(datos), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export const POST: APIRoute = async ({
  request,
  cookies
}) => {
  const origin = request.headers.get("origin");

  if (
    origin &&
    origin !== new URL(request.url).origin
  ) {
    return responder({
      ok: false,
      mensaje: "Origen no permitido."
    }, 403);
  }

  try {
    const usuario = await getUsuarioDesdeSesion(
      cookies.get("session_id")?.value
    );

    if (!usuario) {
      return responder({
        ok: false,
        mensaje: "Debes iniciar sesión."
      }, 401);
    }

    if (usuario.tipo_usuario !== "organizacion") {
      return responder({
        ok: false,
        mensaje: "Solo las organizaciones pueden publicar."
      }, 403);
    }

    const datos = await request.formData();

    const nombre = String(
      datos.get("nombre") ?? ""
    ).trim();

    const tipo = String(
      datos.get("tipoMascota") ?? ""
    ).trim();

    const descripcion = String(
      datos.get("descripcion") ?? ""
    ).trim();

    const personalidad = procesarClasificacion(
      datos.get("personalidadCodigo"),
      datos.get("personalidadDetalle"),
      PERSONALIDADES,
      "la personalidad"
    );

    const salud = procesarClasificacion(
      datos.get("saludCodigo"),
      datos.get("saludDetalle"),
      ANTECEDENTES_MEDICOS,
      "los antecedentes médicos"
    );

    if (!nombre || nombre.length > 100) {
      return responder({
        ok: false,
        mensaje: "Nombre inválido."
      }, 400);
    }

    if (!["perro", "gato", "otro"].includes(tipo)) {
      return responder({
        ok: false,
        mensaje: "Tipo de mascota inválido."
      }, 400);
    }

    if (descripcion.length > 5000) {
      return responder({
        ok: false,
        mensaje: "Descripción demasiado larga."
      }, 400);
    }

    if (!personalidad.ok) {
      return responder({
        ok: false,
        mensaje: personalidad.mensaje
      }, 400);
    }

    if (!salud.ok) {
      return responder({
        ok: false,
        mensaje: salud.mensaje
      }, 400);
    }

    const imagen = await validarImagen(
      datos.get("foto"),
      true
    );

    // Registrar los datos de la mascota.
    const resultado = await db.query(
      `INSERT INTO mascotas (
         usuario_id,
         nombre,
         descripcion,
         personalidad,
         personalidad_codigo,
         historial_medico,
         salud_codigo,
         estado_adopcion,
         tipo_mascota
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, 'disponible', $8
       )
       RETURNING id`,
      [
        usuario.id,
        nombre,
        descripcion || null,
        personalidad.texto,
        personalidad.codigo,
        salud.texto,
        salud.codigo,
        tipo
      ]
    );

    const mascotaId = Number(
      resultado.rows[0].id
    );

    let fotoNueva: string | null = null;

    try {
      if (imagen) {
        // Subir el archivo a Azure.
        fotoNueva = await subirImagen(
          "mascotas",
          mascotaId,
          imagen
        );

        // Guardar la referencia en PostgreSQL.
        await db.query(
          `UPDATE mascotas
           SET foto_blob = $1
           WHERE id = $2`,
          [fotoNueva, mascotaId]
        );
      }

    } catch (error) {
      // Intentar revertir una publicación incompleta.
      if (fotoNueva) {
        await borrarImagen(fotoNueva)
          .catch(console.error);
      }

      await db.query(
        `DELETE FROM mascotas
         WHERE id = $1 AND usuario_id = $2`,
        [mascotaId, usuario.id]
      ).catch(console.error);

      throw error;
    }

    return responder({
      ok: true,
      mensaje: "Mascota publicada correctamente.",
      mascotaId
    }, 201);

  } catch (error) {
    if (error instanceof ErrorImagen) {
      return responder({
        ok: false,
        mensaje: error.message
      }, 400);
    }

    console.error("Error publicando mascota:", error);

    return responder({
      ok: false,
      mensaje: "No se pudo publicar la mascota."
    }, 500);
  }
};
