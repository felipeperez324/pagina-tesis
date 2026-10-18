
import type { APIRoute } from "astro";

import {
  validarSesion,
  NOMBRE_COOKIE,
  DURACION_SESION
} from "../../../lib/seguridad/sesiones";

/**
 * KODAPP - RENOVACIÓN POR ACTIVIDAD
 *
 * El navegador llama a esta ruta cuando
 * detecta interacción del usuario.
 */

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (
    request.headers.get("origin") !==
    new URL(request.url).origin
  ) {
    return new Response(
      JSON.stringify({ error: "Origen no permitido." }),
      { status: 403 }
    );
  }

  const sessionId = cookies.get(NOMBRE_COOKIE)?.value;

  // PostgreSQL decide si sigue válida.
  const usuarioId = await validarSesion(sessionId);

  if (!usuarioId || !sessionId) {
    cookies.delete(NOMBRE_COOKIE, { path: "/" });

    return new Response(
      JSON.stringify({
        autenticado: false
      }),
      { status: 401 }
    );
  }

  // Renovar cookie solo tras validación.
  cookies.set(NOMBRE_COOKIE, sessionId, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_SESION
  });

  return new Response(
    JSON.stringify({
      autenticado: true
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
};
