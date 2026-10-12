
import type { APIRoute } from "astro";

import { db } from "../../../lib/db";
import { dbFotos } from "../../../lib/dbfotos";
import { getUsuarioDesdeSesion } from "../../../lib/auth";

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
// ELIMINAR PUBLICACIÓN DE MASCOTA
// ==========================================
export const DELETE: APIRoute = async ({ request, cookies }) => {
  try {
    // 1. Comprobar la sesión.
    const sessionId = cookies.get("session_id")?.value;
    const usuario = await getUsuarioDesdeSesion(sessionId);

    if (!usuario) {
      return responder({
        ok: false,
        mensaje: "Debes iniciar sesión."
      }, 401);
    }

    // 2. Solo las organizaciones pueden eliminar.
    if (usuario.tipo_usuario !== "organizacion") {
      return responder({
        ok: false,
        mensaje: "No tienes permisos para eliminar publicaciones."
      }, 403);
    }

    // 3. Obtener ID de la publicación.
    const datos = await request.json().catch(() => null);
    const id = Number(datos?.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return responder({
        ok: false,
        mensaje: "El ID de la publicación no es válido."
      }, 400);
    }

    // 4. Eliminar de la base principal.
    // Solo si pertenece a esta organización.
    let resultado;

    try {
      resultado = await db.query(
        `DELETE FROM mascotas
         WHERE id = $1
           AND usuario_id = $2
         RETURNING id`,
        [id, usuario.id]
      );
    } catch (error: unknown) {
      console.error("Error al eliminar mascota:", error);

      // Puede haber solicitudes u otros registros
      // relacionados que impiden el borrado.
      const codigo = (error as { code?: string })?.code;

      if (codigo === "23503") {
        return responder({
          ok: false,
          mensaje:
            "No se puede eliminar esta publicación porque " +
            "tiene registros relacionados."
        }, 409);
      }

      return responder({
        ok: false,
        mensaje: "No se pudo eliminar la publicación."
      }, 500);
    }

    // Si no se eliminó, no existe o no pertenece al usuario.
    if (resultado.rows.length === 0) {
      return responder({
        ok: false,
        mensaje: "La publicación no existe o no te pertenece."
      }, 404);
    }

    // 5. Eliminar fotografía de KodApp_Fotos.
    try {
      await dbFotos.query(
        `DELETE FROM fotos_mascotas
         WHERE mascota_id = $1`,
        [id]
      );
    } catch (error) {
      console.error(
        "La publicación se eliminó, pero falló la limpieza de su foto:",
        error
      );

      // Son dos bases independientes:
      // la publicación ya fue eliminada correctamente.
      return responder({
        ok: true,
        advertencia: true,
        mensaje:
          "Publicación eliminada, pero no se pudo borrar " +
          "su fotografía de la base de imágenes."
      });
    }

    // 6. Todo correcto.
    return responder({
      ok: true,
      mensaje: "Publicación y fotografía eliminadas correctamente."
    });

  } catch (error) {
    console.error("Error inesperado al eliminar:", error);

    return responder({
      ok: false,
      mensaje: "Ocurrió un error al eliminar la publicación."
    }, 500);
  }
};
