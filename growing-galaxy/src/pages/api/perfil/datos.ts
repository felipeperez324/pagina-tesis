
import type { APIRoute } from "astro";

import { db } from "../../../lib/db";
import { getUsuarioDesdeSesion } from "../../../lib/auth";

/**
 * KODAPP - DATOS PARA CONFIGURACIÓN
 *
 * Nunca enviamos hashes ni contraseñas al navegador.
 */

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  const usuario = await getUsuarioDesdeSesion(
    cookies.get("session_id")?.value
  );

  if (!usuario) {
    return new Response(
      JSON.stringify({ error: "Sesión expirada." }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  try {
    const resultado = await db.query(
      `SELECT nombre, correo, tipo_usuario
       FROM usuarios
       WHERE id = $1`,
      [usuario.id]
    );

    if (resultado.rows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Usuario no encontrado." }),
        { status: 404 }
      );
    }

    return new Response(
      JSON.stringify(resultado.rows[0]),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    console.error("Error leyendo perfil:", error);

    return new Response(
      JSON.stringify({ error: "No se pudo cargar el perfil." }),
      { status: 500 }
    );
  }
};
