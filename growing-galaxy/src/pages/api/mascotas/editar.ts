
import type { APIRoute } from "astro";
import { db } from "../../../lib/db";
import { dbFotos } from "../../../lib/dbfotos";
import { getUsuarioDesdeSesion } from "../../../lib/auth";

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

// ==========================================
// EDITAR UNA PUBLICACIÓN EXISTENTE
// ==========================================
export const POST: APIRoute = async ({ request, cookies }) => {
  const sessionId = cookies.get("session_id")?.value;

  try {
    const usuario = await getUsuarioDesdeSesion(sessionId);

    if (!usuario) {
      return responder({
        ok: false,
        mensaje: "Debes iniciar sesión."
      }, 401);
    }

    if (usuario.tipo_usuario !== "organizacion") {
      return responder({
        ok: false,
        mensaje: "Solo las organizaciones pueden editar publicaciones."
      }, 403);
    }

    const datos = await request.formData();

    const id = Number(datos.get("id"));
    const nombre = String(datos.get("nombre") ?? "").trim();
    const tipoMascota = String(datos.get("tipoMascota") ?? "").trim();
    const descripcion = String(datos.get("descripcion") ?? "").trim();
    const personalidad = String(datos.get("personalidad") ?? "").trim();
    const historialMedico = String(
      datos.get("historialMedico") ?? ""
    ).trim();
    const estadoAdopcion = String(
      datos.get("estadoAdopcion") ?? ""
    ).trim();

    const archivo = datos.get("foto");

    // ======================================
    // VALIDACIONES
    // ======================================

    if (!Number.isSafeInteger(id) || id <= 0) {
      return responder({
        ok: false,
        mensaje: "Publicación inválida."
      }, 400);
    }

    if (!nombre || nombre.length > 100) {
      return responder({
        ok: false,
        mensaje: "Introduce un nombre válido."
      }, 400);
    }

    if (!["perro", "gato", "otro"].includes(tipoMascota)) {
      return responder({
        ok: false,
        mensaje: "Tipo de mascota inválido."
      }, 400);
    }

    if (
      !["disponible", "reservada", "adoptada"]
        .includes(estadoAdopcion)
    ) {
      return responder({
        ok: false,
        mensaje: "Estado de adopción inválido."
      }, 400);
    }

    if (
      descripcion.length > 5000 ||
      personalidad.length > 5000 ||
      historialMedico.length > 5000
    ) {
      return responder({
        ok: false,
        mensaje: "Uno de los textos es demasiado largo."
      }, 400);
    }

    let imagenBuffer: Buffer | null = null;
    let imagenMime: string | null = null;

    if (archivo instanceof File && archivo.size > 0) {
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

    // ======================================
    // TRANSACCIÓN EN LA BASE PRINCIPAL
    // ======================================

    const conexion = await db.connect();

    try {
      await conexion.query("BEGIN");

      // Solo puede actualizar una publicación
      // que pertenezca al usuario conectado.
      const resultado = await conexion.query(
        `UPDATE mascotas
         SET
           nombre = $1,
           tipo_mascota = $2,
           descripcion = $3,
           personalidad = $4,
           historial_medico = $5,
           estado_adopcion = $6
         WHERE id = $7
           AND usuario_id = $8
         RETURNING id`,
        [
          nombre,
          tipoMascota,
          descripcion || null,
          personalidad || null,
          historialMedico || null,
          estadoAdopcion,
          id,
          usuario.id
        ]
      );

      if (resultado.rows.length === 0) {
        await conexion.query("ROLLBACK");

        return responder({
          ok: false,
          mensaje: "La publicación no existe o no te pertenece."
        }, 404);
      }

      // ====================================
      // FOTO EN LA SEGUNDA BASE DE DATOS
      // ====================================
      //
      // Si no se seleccionó una imagen,
      // se conserva la foto existente.

      if (imagenBuffer && imagenMime) {
        await dbFotos.query(
          `INSERT INTO fotos_mascotas (
            mascota_id,
            imagen,
            tipo_mime
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (mascota_id)
          DO UPDATE SET
            imagen = EXCLUDED.imagen,
            tipo_mime = EXCLUDED.tipo_mime,
            fecha_actualizacion = NOW()`,
          [
            id,
            imagenBuffer,
            imagenMime
          ]
        );
      }

      await conexion.query("COMMIT");

      return responder({
        ok: true,
        mensaje: "Publicación actualizada correctamente."
      });

    } catch (error) {
      await conexion.query("ROLLBACK").catch(() => {});

      console.error("Error al actualizar mascota:", error);

      return responder({
        ok: false,
        mensaje: "No se pudo actualizar la publicación."
      }, 500);

    } finally {
      conexion.release();
    }

  } catch (error) {
    console.error("Error en API de edición:", error);

    return responder({
      ok: false,
      mensaje: "Ocurrió un error al procesar la publicación."
    }, 500);
  }
};
