
import type { APIRoute } from "astro";

import { db } from "../../../lib/db";
import { getUsuarioDesdeSesion } from "../../../lib/auth";
import { PERSONALIDADES } from "../../../lib/CatalogoMatch";

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
// GUARDAR PREFERENCIAS DEL ADOPTANTE
// ==========================================

export const POST: APIRoute = async ({
  request,
  cookies
}) => {
  try {
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

    const usuario = await getUsuarioDesdeSesion(
      cookies.get("session_id")?.value
    );

    if (!usuario) {
      return responder({
        ok: false,
        mensaje: "Debes iniciar sesión."
      }, 401);
    }

    if (usuario.tipo_usuario !== "adoptante") {
      return responder({
        ok: false,
        mensaje:
          "Solo los adoptantes pueden configurar preferencias."
      }, 403);
    }


    // LEER RESPUESTAS

    const cuerpo: unknown =
      await request.json().catch(() => null);

    if (
      !cuerpo ||
      typeof cuerpo !== "object" ||
      Array.isArray(cuerpo)
    ) {
      return responder({
        ok: false,
        mensaje: "Datos inválidos."
      }, 400);
    }

    const datos = cuerpo as Record<string, unknown>;

    const tipoPreferido = datos.tipoPreferido;

    const personalidadPreferida =
      datos.personalidadPreferida;

    const nivelCuidados = datos.nivelCuidados;


    // VALIDACIONES

    if (
      typeof tipoPreferido !== "string" ||
      !["perro", "gato", "otro", "indiferente"]
        .includes(tipoPreferido)
    ) {
      return responder({
        ok: false,
        mensaje: "Selecciona un tipo de mascota válido."
      }, 400);
    }

    const personalidadesValidas = [
      ...PERSONALIDADES.map((item) => item.valor),
      "indiferente"
    ];

    if (
      typeof personalidadPreferida !== "string" ||
      !personalidadesValidas.includes(
        personalidadPreferida
      )
    ) {
      return responder({
        ok: false,
        mensaje: "Selecciona una personalidad válida."
      }, 400);
    }

    if (
      typeof nivelCuidados !== "string" ||
      ![
        "basicos",
        "tratamientos",
        "especiales",
        "indiferente"
      ].includes(nivelCuidados)
    ) {
      return responder({
        ok: false,
        mensaje: "Selecciona un nivel de cuidados válido."
      }, 400);
    }


    // GUARDAR O ACTUALIZAR

    await db.query(
      `INSERT INTO preferencias_match (
        usuario_id,
        tipo_preferido,
        personalidad_preferida,
        nivel_cuidados
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (usuario_id)
      DO UPDATE SET
        tipo_preferido = EXCLUDED.tipo_preferido,
        personalidad_preferida =
          EXCLUDED.personalidad_preferida,
        nivel_cuidados = EXCLUDED.nivel_cuidados,
        actualizada_en = NOW()`,
      [
        usuario.id,
        tipoPreferido,
        personalidadPreferida,
        nivelCuidados
      ]
    );

    return responder({
      ok: true,
      mensaje: "Preferencias guardadas correctamente."
    });

  } catch (error) {
    console.error(
      "Error al guardar preferencias:",
      error
    );

    return responder({
      ok: false,
      mensaje: "No se pudieron guardar las preferencias."
    }, 500);
  }
};
