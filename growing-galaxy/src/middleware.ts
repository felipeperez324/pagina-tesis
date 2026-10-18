
import type { APIContext } from "astro";
import { defineMiddleware } from "astro:middleware";

import {
  validarSesion,
  NOMBRE_COOKIE,
  DURACION_SESION
} from "./lib/seguridad/sesiones";

/**
 * KODAPP - MIDDLEWARE DE AUTENTICACIÓN
 *
 * Protege páginas privadas y endpoints.
 * Comprueba el vencimiento en PostgreSQL.
 */

function rechazarAcceso(
  context: APIContext,
  ruta: string
): Response {
  if (ruta.startsWith("/api/")) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Sesión expirada.",
        mensaje: "Debes iniciar sesión nuevamente."
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  return context.redirect("/login?expirada=1");
}

export const onRequest = defineMiddleware(
  async (context, next) => {
    const ruta = context.url.pathname;

    // Rutas que requieren una cuenta conectada.
    const rutasProtegidas = [
      "/perfil",
      "/usuario",
      "/gestion",
      "/configuracion",
      "/rescatista",
      "/api/perfil",
      "/api/mascotas",
      "/api/auth/actividad"
    ];

    const protegida = rutasProtegidas.some(
      prefijo =>
        ruta === prefijo ||
        ruta.startsWith(prefijo + "/")
    );

    const sessionId =
      context.cookies.get(NOMBRE_COOKIE)?.value;

    // Si falta la cookie, rechazar solamente
    // el acceso a páginas protegidas.
    if (!sessionId) {
      return protegida
        ? rechazarAcceso(context, ruta)
        : next();
    }

    let usuarioId: number | null;

    try {
      // Validación real en la base de datos.
      usuarioId = await validarSesion(sessionId);
    } catch (error) {
      console.error("No se pudo validar la sesión:", error);

      return new Response(
        "No se pudo verificar la sesión.",
        { status: 503 }
      );
    }

    // Sesión inexistente o expirada.
    if (!usuarioId) {
      context.cookies.delete(NOMBRE_COOKIE, {
        path: "/"
      });

      return protegida
        ? rechazarAcceso(context, ruta)
        : next();
    }

    // Renovar una hora desde la actividad válida.
    context.cookies.set(NOMBRE_COOKIE, sessionId, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: "lax",
      path: "/",
      maxAge: DURACION_SESION
    });

    return next();
  }
);
