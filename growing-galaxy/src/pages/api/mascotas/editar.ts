
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
        mensaje: "Sin permisos."
      }, 403);
    }

    const datos = await request.formData();

    const id = Number(datos.get("id"));

    if (!Number.isSafeInteger(id) || id <= 0) {
      return responder({
        ok: false,
        mensaje: "ID inválido."
      }, 400);
    }

    const nombre = String(
      datos.get("nombre") ?? ""
    ).trim();

    const tipo = String(
      datos.get("tipoMascota") ?? ""
    ).trim();

    const descripcion = String(
      datos.get("descripcion") ?? ""
    ).trim();

    const estado = String(
      datos.get("estadoAdopcion") ?? ""
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
        mensaje: "Tipo inválido."
      }, 400);
    }

    if (
      !["disponible", "reservada", "adoptada"]
        .includes(estado)
    ) {
      return responder({
        ok: false,
        mensaje: "Estado inválido."
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

    // Consultar la publicación y verificar propiedad.
    const anterior = await db.query(
      `SELECT foto_blob
       FROM mascotas
       WHERE id = $1
         AND usuario_id = $2`,
      [id, usuario.id]
    );

    if (!anterior.rows.length) {
      return responder({
        ok: false,
        mensaje: "Mascota no encontrada o sin permisos."
      }, 404);
    }

    let fotoNueva: string | null = null;

    // Si se seleccionó otra imagen, subirla.
    if (imagen) {
      fotoNueva = await subirImagen(
        "mascotas",
        id,
        imagen
      );
    }

    try {
      const resultado = await db.query(
        `UPDATE mascotas
         SET
           nombre = $1,
           tipo_mascota = $2,
           descripcion = $3,
           personalidad = $4,
           personalidad_codigo = $5,
           historial_medico = $6,
           salud_codigo = $7,
           estado_adopcion = $8,
           foto_blob = COALESCE($9, foto_blob)
         WHERE id = $10
           AND usuario_id = $11
         RETURNING id`,
        [
          nombre,
          tipo,
          descripcion || null,
          personalidad.texto,
          personalidad.codigo,
          salud.texto,
          salud.codigo,
          estado,
          fotoNueva,
          id,
          usuario.id
        ]
      );

      if (!resultado.rows.length) {
        if (fotoNueva) {
          await borrarImagen(fotoNueva)
            .catch(console.error);
        }

        return responder({
          ok: false,
          mensaje: "Mascota no encontrada."
        }, 404);
      }

    } catch (error) {
      if (fotoNueva) {
        await borrarImagen(fotoNueva)
          .catch(console.error);
      }

      throw error;
    }

    // Borrar la fotografía reemplazada.
    const fotoAntigua =
      anterior.rows[0].foto_blob as string | null;

    if (fotoNueva && fotoAntigua) {
      await borrarImagen(fotoAntigua).catch(error =>
        console.error(
          "No se pudo borrar foto anterior:",
          error
        )
      );
    }

    return responder({
      ok: true,
      mensaje: "Mascota actualizada correctamente."
    });

  } catch (error) {
    if (error instanceof ErrorImagen) {
      return responder({
        ok: false,
        mensaje: error.message
      }, 400);
    }

    console.error("Error editando mascota:", error);

    return responder({
      ok: false,
      mensaje: "No se pudo actualizar la mascota."
    }, 500);
  }
};
