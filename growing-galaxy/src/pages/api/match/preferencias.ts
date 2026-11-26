
import type { APIRoute } from "astro";

import { db } from "../../../lib/db";

import {
  getUsuarioDesdeSesion
} from "../../../lib/auth";

import {
  leerPreferenciasMatch
} from "../../../lib/serializerMatch";

export const prerender = false;

// ==========================================
// SERIALIZACIÓN DE RESPUESTAS
// ==========================================

function responder(
  datos: {
    ok: boolean;
    mensaje: string;
  },
  estado = 200
): Response {

  return new Response(
    JSON.stringify({
      ok: datos.ok,
      mensaje: datos.mensaje
    }),
    {
      status: estado,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );

}

// ==========================================
// GUARDAR PREFERENCIAS DEL ADOPTANTE
// ==========================================

export const POST: APIRoute = async ({
  request,
  cookies
}) => {

  try {

    // ======================================
    // VALIDAR ORIGEN
    // ======================================

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

    // ======================================
    // VALIDAR SESIÓN
    // ======================================

    const usuario = await getUsuarioDesdeSesion(
      cookies.get("session_id")?.value
    );

    if (!usuario) {

      return responder({
        ok: false,
        mensaje: "Debes iniciar sesión."
      }, 401);

    }

    // ======================================
    // VALIDAR ROL
    // ======================================

    if (usuario.tipo_usuario !== "adoptante") {

      return responder({
        ok: false,
        mensaje:
          "Solo los adoptantes pueden configurar preferencias."
      }, 403);

    }

    // ======================================
    // LEER DATOS RAW
    // ======================================

    const cuerpo: unknown =
      await request.json().catch(() => null);

    // ======================================
    // SERIALIZER DE ENTRADA
    // ======================================

    const validacion =
      leerPreferenciasMatch(cuerpo);

    if (!validacion.ok) {

      return responder({
        ok: false,
        mensaje: validacion.mensaje
      }, 400);

    }

    // Datos previamente validados.

    const {
      tipoPreferido,
      personalidadPreferida,
      nivelCuidados,
      comunaPreferida
    } = validacion.datos;

    // ======================================
    // EVIDENCIA LOCAL DEL SERIALIZER
    // ======================================

    if (import.meta.env.DEV) {

      console.log(
        "[MATCH] Datos normalizados:",
        JSON.stringify(validacion.datos, null, 2)
      );

    }

    // ======================================
    // GUARDAR O ACTUALIZAR PREFERENCIAS
    // ======================================

    await db.query(
      `INSERT INTO preferencias_match (
        usuario_id,
        tipo_preferido,
        personalidad_preferida,
        nivel_cuidados,
        comuna_preferida
      )
      VALUES ($1, $2, $3, $4, $5)

      ON CONFLICT (usuario_id)

      DO UPDATE SET
        tipo_preferido =
          EXCLUDED.tipo_preferido,

        personalidad_preferida =
          EXCLUDED.personalidad_preferida,

        nivel_cuidados =
          EXCLUDED.nivel_cuidados,

        comuna_preferida =
          EXCLUDED.comuna_preferida,

        actualizada_en = NOW()`,

      [
        usuario.id,
        tipoPreferido,
        personalidadPreferida,
        nivelCuidados,
        comunaPreferida
      ]
    );

    // ======================================
    // SERIALIZER DE RESPUESTA
    // ======================================

    return responder({
      ok: true,
      mensaje:
        "Preferencias guardadas correctamente."
    });

  } catch (error) {

    console.error(
      "Error al guardar preferencias:",
      error
    );

    return responder({
      ok: false,
      mensaje:
        "No se pudieron guardar las preferencias."
    }, 500);

  }

};
