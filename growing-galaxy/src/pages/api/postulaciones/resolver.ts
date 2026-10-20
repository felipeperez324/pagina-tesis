
import type { APIRoute } from "astro";
import { db } from "../../../lib/db";
import { getUsuarioDesdeSesion } from "../../../lib/auth";

export const prerender = false;

/**
 * KODAPP - RESOLVER POSTULACIONES
 *
 * Acciones:
 * aprobar  -> estado 'aprobada'
 * rechazar -> estado 'rechazada'
 *
 * No registra adopciones ni cambia el
 * estado de adopción de la mascota.
 */

function responder(
  datos: Record<string, unknown>,
  status = 200
): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export const POST: APIRoute = async ({
  request,
  cookies
}) => {
  if (
    request.headers.get("origin") !==
    new URL(request.url).origin
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
      mensaje: "Sesión expirada."
    }, 401);
  }

  if (usuario.tipo_usuario !== "organizacion") {
    return responder({
      ok: false,
      mensaje:
        "Solo las organizaciones pueden evaluar postulaciones."
    }, 403);
  }

  const cuerpo: unknown =
    await request.json().catch(() => null);

  if (
    !cuerpo ||
    typeof cuerpo !== "object" ||
    Array.isArray(cuerpo)
  ) {
    return responder({
      ok: false,
      mensaje: "Solicitud inválida."
    }, 400);
  }

  const datos = cuerpo as Record<string, unknown>;

  const postulacionId = Number(datos.postulacionId);
  const decision = datos.decision;

  if (
    !Number.isSafeInteger(postulacionId) ||
    postulacionId <= 0 ||
    !["aprobar", "rechazar"].includes(String(decision))
  ) {
    return responder({
      ok: false,
      mensaje: "Postulación o decisión inválida."
    }, 400);
  }

  const nuevoEstado =
    decision === "aprobar"
      ? "aprobada"
      : "rechazada";

  const conexion = await db.connect();

  try {
    await conexion.query("BEGIN");

    // Bloquear la mascota de esta postulación.
    // Así dos decisiones simultáneas no pueden
    // aprobar solicitudes incompatibles.
    const mascota = await conexion.query(
      `SELECT
         m.id,
         m.estado_adopcion
       FROM mascotas m
       JOIN postulaciones p
         ON p.mascota_id = m.id
       WHERE p.id = $1
         AND m.usuario_id = $2
       FOR UPDATE OF m`,
      [postulacionId, usuario.id]
    );

    if (mascota.rows.length === 0) {
      await conexion.query("ROLLBACK");

      return responder({
        ok: false,
        mensaje:
          "La postulación no existe o no corresponde a tu organización."
      }, 404);
    }

    // Bloquear la postulación que vamos a resolver.
    const consulta = await conexion.query(
      `SELECT
         id,
         mascota_id,
         estado
       FROM postulaciones
       WHERE id = $1
       FOR UPDATE`,
      [postulacionId]
    );

    if (consulta.rows.length === 0) {
      await conexion.query("ROLLBACK");

      return responder({
        ok: false,
        mensaje: "Postulación no encontrada."
      }, 404);
    }

    const postulacion = consulta.rows[0];

    if (postulacion.estado !== "pendiente") {
      await conexion.query("ROLLBACK");

      return responder({
        ok: false,
        mensaje:
          "Esta postulación ya fue evaluada."
      }, 409);
    }

    if (nuevoEstado === "aprobada") {
      if (
        mascota.rows[0].estado_adopcion !== "disponible"
      ) {
        await conexion.query("ROLLBACK");

        return responder({
          ok: false,
          mensaje:
            "La mascota ya no está disponible."
        }, 409);
      }

      // Impedir una segunda postulación aprobada.
      const otraAprobada = await conexion.query(
        `SELECT id
         FROM postulaciones
         WHERE mascota_id = $1
           AND estado = 'aprobada'
         LIMIT 1`,
        [postulacion.mascota_id]
      );

      if (otraAprobada.rows.length > 0) {
        await conexion.query("ROLLBACK");

        return responder({
          ok: false,
          mensaje:
            "Esta mascota ya tiene una postulación aprobada."
        }, 409);
      }
    }

    // Cambiar únicamente el estado de la postulación.
    await conexion.query(
      `UPDATE postulaciones
       SET estado = $1,
           resuelta_en = NOW()
       WHERE id = $2`,
      [nuevoEstado, postulacionId]
    );

    await conexion.query("COMMIT");

    return responder({
      ok: true,
      mensaje:
        nuevoEstado === "aprobada"
          ? "Postulación aprobada correctamente."
          : "Postulación rechazada correctamente.",
      estado: nuevoEstado
    });

  } catch (error) {
    await conexion.query("ROLLBACK").catch(() => {});

    const codigo =
      (error as { code?: string }).code;

    if (codigo === "23505") {
      return responder({
        ok: false,
        mensaje:
          "Ya existe una postulación aprobada para esta mascota."
      }, 409);
    }

    console.error(
      "Error al resolver postulación:",
      error
    );

    return responder({
      ok: false,
      mensaje: "No se pudo evaluar la postulación."
    }, 500);

  } finally {
    conexion.release();
  }
};
