
import type { APIRoute } from "astro";

import { db } from "../../../lib/db";
import { dbFotos } from "../../../lib/dbfotos";
import { getUsuarioDesdeSesion } from "../../../lib/auth";

export const prerender = false;

// Respuesta JSON para el navegador.
function responder(
  datos: Record<string, unknown>,
  estado = 200
) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

// ==========================================
// CREAR PUBLICACIÓN DE MASCOTA
// ==========================================
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // 1. COMPROBAR SESIÓN

    const sessionId = cookies.get("session_id")?.value;

    const usuario = await getUsuarioDesdeSesion(sessionId);

    if (!usuario) {
      return responder(
        {
          ok: false,
          mensaje: "Debes iniciar sesión.",
        },
        401
      );
    }

    // 2. COMPROBAR PERMISOS

    if (usuario.tipo_usuario !== "organizacion") {
      return new Response(
        JSON.stringify({
          ok: false,
          mensaje: "Solo las organizaciones pueden publicar mascotas."
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    // 3. OBTENER DATOS DEL FORMULARIO

    const formData = await request.formData();

    const nombre = formData
      .get("nombre")
      ?.toString()
      .trim();

    const tipoMascota = formData
      .get("tipoMascota")
      ?.toString()
      .trim();

    const descripcion = formData
      .get("descripcion")
      ?.toString()
      .trim();

    const personalidad = formData
      .get("personalidad")
      ?.toString()
      .trim();

    const historialMedico = formData
      .get("historialMedico")
      ?.toString()
      .trim();

    const archivo = formData.get("foto");

    // 4. VALIDAR LOS DATOS

    if (!nombre || !tipoMascota) {
      return responder(
        {
          ok: false,
          mensaje: "El nombre y el tipo son obligatorios.",
        },
        400
      );
    }

    if (nombre.length > 100) {
      return responder(
        {
          ok: false,
          mensaje: "El nombre es demasiado largo.",
        },
        400
      );
    }

    if (!["perro", "gato", "otro"].includes(tipoMascota)) {
      return responder(
        {
          ok: false,
          mensaje: "El tipo de mascota no es válido.",
        },
        400
      );
    }

    // 5. PROCESAR LA FOTO

    let imagenBuffer: Buffer | null = null;
    let imagenMime: string | null = null;

    if (archivo !== null) {
      if (!(archivo instanceof File)) {
        return responder(
          {
            ok: false,
            mensaje: "El archivo recibido no es válido.",
          },
          400
        );
      }

      if (archivo.size > 0) {
        const tiposPermitidos = [
          "image/jpeg",
          "image/png",
          "image/webp",
        ];

        if (!tiposPermitidos.includes(archivo.type)) {
          return responder(
            {
              ok: false,
              mensaje: "Solo se permiten imágenes JPG, PNG o WebP.",
            },
            400
          );
        }

        if (archivo.size > 5 * 1024 * 1024) {
          return responder(
            {
              ok: false,
              mensaje: "La imagen no puede superar los 5 MB.",
            },
            400
          );
        }

        imagenBuffer = Buffer.from(
          await archivo.arrayBuffer()
        );

        imagenMime = archivo.type;
      }
    }

    // ==========================================
    // 6. GUARDAR MASCOTA EN LA BASE PRINCIPAL
    // ==========================================
    //
    // KodApp guarda solamente los datos de
    // la mascota. Ya NO guarda su fotografía.

    const resultado = await db.query(
      `INSERT INTO mascotas (
        usuario_id,
        nombre,
        descripcion,
        personalidad,
        historial_medico,
        estado_adopcion,
        tipo_mascota
      )
      VALUES (
        $1, $2, $3, $4, $5, 'disponible', $6
      )
      RETURNING id`,
      [
        usuario.id,
        nombre,
        descripcion || null,
        personalidad || null,
        historialMedico || null,
        tipoMascota,
      ]
    );

    const mascotaId = Number(resultado.rows[0].id);

    // ==========================================
    // 7. GUARDAR FOTO EN KODAPP_FOTOS
    // ==========================================

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
            imagenMime,
          ]
        );

      } catch (error) {
        console.error(
          "Error al guardar imagen de mascota:",
          error
        );

        // Como son dos bases de datos distintas,
        // si falla la fotografía intentamos borrar
        // la publicación recién creada.
        try {
          await db.query(
            `DELETE FROM mascotas
             WHERE id = $1
               AND usuario_id = $2`,
            [mascotaId, usuario.id]
          );
        } catch (errorBorrado) {
          console.error(
            "No se pudo deshacer la publicación:",
            errorBorrado
          );
        }

        return responder(
          {
            ok: false,
            mensaje:
              "No se pudo guardar la fotografía de la mascota.",
          },
          500
        );
      }
    }

    // ==========================================
    // 8. PUBLICACIÓN CREADA
    // ==========================================

    return responder(
      {
        ok: true,
        mensaje: "Mascota publicada correctamente.",
        mascotaId,
      },
      201
    );

  } catch (error) {
    console.error("Error al publicar mascota:", error);

    return responder(
      {
        ok: false,
        mensaje: "No se pudo publicar la mascota.",
      },
      500
    );
  }
};
