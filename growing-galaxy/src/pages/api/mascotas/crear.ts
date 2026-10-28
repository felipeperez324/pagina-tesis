
import type { APIRoute } from "astro";

import { db } from "../../../lib/db";
import { dbFotos } from "../../../lib/dbfotos";
import { getUsuarioDesdeSesion } from "../../../lib/auth";

import {
  PERSONALIDADES,
  ANTECEDENTES_MEDICOS,
  procesarClasificacion
} from "../../../lib/CatalogoMatch";

export const prerender = false;

function responder(
  datos: Record<string, unknown>,
  estado = 200
) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}


// ==========================================
// PUBLICAR MASCOTA
// ==========================================

export const POST: APIRoute = async ({
  request,
  cookies
}) => {
  try {

    // SEGURIDAD

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
        mensaje: "Solo las organizaciones pueden publicar mascotas."
      }, 403);
    }


    // OBTENER FORMULARIO

    const datos = await request.formData();

    const nombre = String(
      datos.get("nombre") ?? ""
    ).trim();

    const tipoMascota = String(
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


    // VALIDACIONES

    if (!nombre || nombre.length > 100) {
      return responder({
        ok: false,
        mensaje: "Introduce un nombre válido."
      }, 400);
    }

    if (
      !["perro", "gato", "otro"].includes(tipoMascota)
    ) {
      return responder({
        ok: false,
        mensaje: "Tipo de mascota inválido."
      }, 400);
    }

    if (descripcion.length > 5000) {
      return responder({
        ok: false,
        mensaje: "La descripción es demasiado larga."
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


    // PROCESAR FOTO

    const archivo = datos.get("foto");

    let imagenBuffer: Buffer | null = null;
    let imagenMime: string | null = null;

    if (archivo !== null) {
      if (!(archivo instanceof File)) {
        return responder({
          ok: false,
          mensaje: "El archivo recibido no es válido."
        }, 400);
      }

      if (archivo.size > 0) {
        const tiposPermitidos = [
          "image/jpeg",
          "image/png",
          "image/webp"
        ];

        if (!tiposPermitidos.includes(archivo.type)) {
          return responder({
            ok: false,
            mensaje: "Solo se permiten imágenes JPG, PNG o WebP."
          }, 400);
        }

        if (archivo.size > 5 * 1024 * 1024) {
          return responder({
            ok: false,
            mensaje: "La imagen no puede superar los 5 MB."
          }, 400);
        }

        imagenBuffer = Buffer.from(
          await archivo.arrayBuffer()
        );

        imagenMime = archivo.type;
      }
    }


    // GUARDAR DATOS PRINCIPALES

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
        tipoMascota
      ]
    );

    const mascotaId = Number(
      resultado.rows[0].id
    );


    // GUARDAR FOTO EN KODAPP_FOTOS

    if (imagenBuffer && imagenMime) {
      try {
        await dbFotos.query(
          `INSERT INTO fotos_mascotas (
            mascota_id,
            imagen,
            tipo_mime
          )
          VALUES ($1, $2, $3)`,
          [
            mascotaId,
            imagenBuffer,
            imagenMime
          ]
        );

      } catch (error) {
        console.error(
          "Error al guardar fotografía:",
          error
        );

        // Revertir publicación si falla la foto.
        try {
          await db.query(
            `DELETE FROM mascotas
             WHERE id = $1 AND usuario_id = $2`,
            [mascotaId, usuario.id]
          );
        } catch (errorBorrado) {
          console.error(
            "Error al revertir publicación:",
            errorBorrado
          );
        }

        return responder({
          ok: false,
          mensaje:
            "No se pudo guardar la fotografía."
        }, 500);
      }
    }

    return responder({
      ok: true,
      mensaje: "Mascota publicada correctamente.",
      mascotaId
    }, 201);

  } catch (error) {
    console.error(
      "Error al publicar mascota:",
      error
    );

    return responder({
      ok: false,
      mensaje: "No se pudo publicar la mascota."
    }, 500);
  }
};
