
import type { APIRoute } from "astro";
import bcrypt from "bcrypt";

import { db } from "../../../lib/db";
import { getUsuarioDesdeSesion } from "../../../lib/auth";
import {
  generarCodigo,
  hashCodigo,
  enviarCodigo
} from "../../../lib/seguridad/correo";

/**
 * KODAPP - SOLICITAR CAMBIO DE CORREO
 *
 * El usuario confirma su contraseña.
 * El servidor envía código al correo nuevo.
 * Todavía no cambia el correo principal.
 */

export const prerender = false;

function responder(datos: object, status = 200) {
  return new Response(JSON.stringify(datos), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (
    request.headers.get("origin") !==
    new URL(request.url).origin
  ) {
    return responder({ error: "Origen no permitido." }, 403);
  }

  const usuario = await getUsuarioDesdeSesion(
    cookies.get("session_id")?.value
  );

  if (!usuario) {
    return responder({ error: "Sesión expirada." }, 401);
  }

  const datos = await request.json().catch(() => null);

  if (!datos || typeof datos !== "object" ||
      Array.isArray(datos)) {
    return responder({ error: "Datos inválidos." }, 400);
  }

  const correoNuevo =
    typeof datos.correoNuevo === "string"
      ? datos.correoNuevo.trim().toLowerCase()
      : "";

  const contrasenaActual = datos.contrasenaActual;

  if (
    correoNuevo.length > 150 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoNuevo)
  ) {
    return responder({ error: "Correo inválido." }, 400);
  }

  if (typeof contrasenaActual !== "string") {
    return responder({ error: "Indica tu contraseña." }, 400);
  }

  try {
    // Comprobar contraseña del titular.
    const consulta = await db.query(
      `SELECT correo, contrasena
       FROM usuarios
       WHERE id = $1`,
      [usuario.id]
    );

    if (consulta.rows.length === 0) {
      return responder({ error: "Usuario no encontrado." }, 404);
    }

    const cuenta = consulta.rows[0];

    const correcta = await bcrypt.compare(
      contrasenaActual,
      cuenta.contrasena
    );

    if (!correcta) {
      return responder({ error: "Contraseña incorrecta." }, 403);
    }

    // No permitir el mismo correo.
    if (correoNuevo === cuenta.correo.toLowerCase()) {
      return responder({
        error: "El correo nuevo debe ser diferente."
      }, 400);
    }

    // Evitar correos ya utilizados.
    const existente = await db.query(
      `SELECT id FROM usuarios
       WHERE LOWER(correo) = $1
         AND id <> $2`,
      [correoNuevo, usuario.id]
    );

    if (existente.rows.length > 0) {
      return responder({ error: "Correo ya registrado." }, 409);
    }

    // Crear código y hash.
    const codigo = generarCodigo();
    const hash = hashCodigo(usuario.id, correoNuevo, codigo);

    // Guardar solicitud de 15 minutos.
    // No permitir otro envío antes de 60 segundos.
    const guardado = await db.query(
      `UPDATE usuarios
       SET correo_pendiente = $1,
           correo_codigo_hash = $2,
           correo_codigo_expira =
             NOW() + INTERVAL '15 minutes',
           correo_codigo_enviado = NOW(),
           correo_codigo_intentos = 0
       WHERE id = $3
         AND (
           correo_codigo_enviado IS NULL
           OR correo_codigo_enviado <=
              NOW() - INTERVAL '60 seconds'
         )
       RETURNING id`,
      [correoNuevo, hash, usuario.id]
    );

    if (guardado.rows.length === 0) {
      return responder({
        error: "Espera un minuto antes de solicitar otro código."
      }, 429);
    }

    try {
      // Enviar al correo NUEVO.
      await enviarCodigo(correoNuevo, codigo);
    } catch (error) {
      console.error("Falló el envío SMTP:", error);

      // Limpiar únicamente esta solicitud.
      await db.query(
        `UPDATE usuarios
         SET correo_pendiente = NULL,
             correo_codigo_hash = NULL,
             correo_codigo_expira = NULL,
             correo_codigo_enviado = NULL,
             correo_codigo_intentos = 0
         WHERE id = $1
           AND correo_codigo_hash = $2`,
        [usuario.id, hash]
      );

      return responder({
        error: "No se pudo enviar el código."
      }, 503);
    }

    return responder({
      success: true,
      mensaje: "Enviamos un código al correo nuevo."
    });

  } catch (error) {
    console.error("Error solicitando correo:", error);
    return responder({
      error: "No se pudo solicitar el cambio."
    }, 500);
  }
};
