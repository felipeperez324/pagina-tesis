import type { APIRoute } from "astro";
import { db } from "../../lib/db";

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
  try {
    const sessionId = cookies.get("session_id")?.value;

    if (sessionId) {
      await db.query(
        `DELETE FROM sesiones
         WHERE id = $1`,
        [sessionId]
      );
    }

    cookies.delete("session_id", {
      path: "/",
    });

    return new Response(
      JSON.stringify({
        ok: true,
        mensaje: "Sesión cerrada correctamente.",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error al cerrar sesión:", error);

    return new Response(
      JSON.stringify({
        ok: false,
        mensaje: "No se pudo cerrar la sesión.",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
};  