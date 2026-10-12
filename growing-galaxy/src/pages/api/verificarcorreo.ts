
import type { APIRoute } from "astro";
import { db } from "../../lib/db";

import {
  comprobarCodigoCorreo,
  generarComprobante,
  hashComprobante
} from "../../lib/verificacioncorreo";

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });

// =========================================
// VERIFICAR CÓDIGO
// =========================================

export const POST: APIRoute = async ({ request }) => {
  const data = await request.json().catch(() => ({}));

  const correo =
    typeof data.correo === "string"
      ? data.correo.trim().toLowerCase()
      : "";

  const codigo =
    typeof data.codigo === "string"
      ? data.codigo.trim()
      : "";

  if (
    correo.length > 150 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ||
    !/^\d{6}$/.test(codigo)
  ) {
    return json({
      ok: false,
      mensaje: "Introduce un correo y un código de 6 dígitos válidos."
    }, 400);
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const resultado = await client.query(
      `SELECT
        codigo_hash,
        expira_en,
        intentos,
        verificado
       FROM verificaciones_registro
       WHERE correo = $1
       FOR UPDATE`,
      [correo]
    );

    if (resultado.rows.length === 0) {
      await client.query("ROLLBACK");

      return json({
        ok: false,
        mensaje: "Primero debes solicitar un código."
      }, 400);
    }

    const verificacion = resultado.rows[0];

    if (verificacion.verificado) {
      await client.query("ROLLBACK");

      return json({
        ok: false,
        mensaje: "El código ya fue utilizado."
      }, 400);
    }

    if (new Date(verificacion.expira_en).getTime() <= Date.now()) {
      await client.query("ROLLBACK");

      return json({
        ok: false,
        mensaje: "El código expiró. Solicita uno nuevo."
      }, 410);
    }

    if (verificacion.intentos >= 5) {
      await client.query("ROLLBACK");

      return json({
        ok: false,
        mensaje: "Demasiados intentos. Solicita un nuevo código."
      }, 429);
    }

    const correcto = comprobarCodigoCorreo(
      correo,
      codigo,
      verificacion.codigo_hash
    );

    if (!correcto) {
      await client.query(
        `UPDATE verificaciones_registro
         SET intentos = intentos + 1
         WHERE correo = $1`,
        [correo]
      );

      await client.query("COMMIT");

      return json({
        ok: false,
        mensaje: "Código incorrecto."
      }, 400);
    }

    // Código correcto: se genera una autorización
    // de un solo uso para crear la cuenta.
    const comprobante = generarComprobante();

    await client.query(
      `UPDATE verificaciones_registro
       SET
         verificado = TRUE,
         comprobante_hash = $2,
         comprobante_expira_en =
           NOW() + INTERVAL '15 minutes'
       WHERE correo = $1`,
      [correo, hashComprobante(comprobante)]
    );

    await client.query("COMMIT");

    return json({
      ok: true,
      comprobante,
      mensaje: "¡Correo verificado correctamente!"
    });

  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error de verificación:", error);

    return json({
      ok: false,
      mensaje: "No se pudo verificar el correo."
    }, 500);

  } finally {
    client.release();
  }
};
