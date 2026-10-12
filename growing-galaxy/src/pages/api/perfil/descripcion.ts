
import type { APIRoute } from "astro";
import { db } from "../../../lib/db";
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

// Guardar o actualizar la descripción del perfil.
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const sessionId = cookies.get("session_id")?.value;
    const usuario = await getUsuarioDesdeSesion(sessionId);

    if (!usuario) {
      return responder({
        ok: false,
        mensaje: "Debes iniciar sesión."
      }, 401);
    }

    const datos = await request.json().catch(() => ({}));

    if (typeof datos.descripcion !== "string") {
      return responder({
        ok: false,
        mensaje: "La descripción no es válida."
      }, 400);
    }

    const descripcion = datos.descripcion.trim();

    if (descripcion.length > 500) {
      return responder({
        ok: false,
        mensaje: "La descripción no puede superar los 500 caracteres."
      }, 400);
    }

    await db.query(
      `UPDATE usuarios
       SET descripcion_perfil = $1
       WHERE id = $2`,
      [descripcion, usuario.id]
    );

    return responder({
      ok: true,
      mensaje: "Descripción actualizada correctamente.",
      descripcion
    });

  } catch (error) {
    console.error("Error al actualizar descripción:", error);

    return responder({
      ok: false,
      mensaje: "No se pudo actualizar la descripción."
    }, 500);
  }
};
