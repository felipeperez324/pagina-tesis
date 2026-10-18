
import type { APIRoute } from "astro";

import {
  eliminarSesion,
  NOMBRE_COOKIE
} from "../../lib/seguridad/sesiones";

/**
 * KODAPP - LOGOUT PRINCIPAL
 *
 * Esta es la ruta que utiliza Header.astro.
 */

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (
    request.headers.get("origin") !==
    new URL(request.url).origin
  ) {
    return new Response(
      JSON.stringify({
        ok: false,
        mensaje: "Origen no permitido."
      }),
      { status: 403 }
    );
  }

  const sessionId = cookies.get(NOMBRE_COOKIE)?.value;

  try {
    // Eliminar la sesión en PostgreSQL.
    await eliminarSesion(sessionId);

    // Eliminar la cookie.
    cookies.delete(NOMBRE_COOKIE, { path: "/" });

    return new Response(
      JSON.stringify({
        ok: true,
        mensaje: "Sesión cerrada."
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    console.error("Error al cerrar sesión:", error);

    return new Response(
      JSON.stringify({
        ok: false,
        mensaje: "No se pudo cerrar la sesión."
      }),
      { status: 500 }
    );
  }
};
