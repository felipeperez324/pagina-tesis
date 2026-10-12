
import type { APIRoute } from "astro";
import { db } from "../../lib/db";

import {
  generarCodigoCorreo,
  hashCodigoCorreo,
  enviarCodigoCorreo
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
// ENVIAR CÓDIGO - KODAPP
// =========================================

export const POST: APIRoute = async ({ request }) => {
  const data = await request.json().catch(() => ({}));

  const correo =
    typeof data.correo === "string"
      ? data.correo.trim().toLowerCase()
      : "";

  if (
    correo.length > 150 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)
  ) {
    return json({
      ok: false,
      mensaje: "Introduce un correo válido."
    }, 400);
  }

  const codigo = generarCodigoCorreo();
  const codigoHash = hashCodigoCorreo(correo, codigo);

  let client;

  try {
    client = await db.connect();

    await client.query("BEGIN");

    // Comprobar que el correo no esté registrado.
    const existe = await client.query(
      "SELECT id FROM usuarios WHERE correo = $1",
      [correo]
    );

    if (existe.rows.length > 0) {
      await client.query("ROLLBACK");

      return json({
        ok: false,
        mensaje: "Este correo ya tiene una cuenta."
      }, 409);
    }

    // =========================================
    // CÓDIGO VÁLIDO POR 15 MINUTOS
    // =========================================

    const resultado = await client.query(
      `INSERT INTO verificaciones_registro (
        correo,
        codigo_hash,
        expira_en
      )
      VALUES (
        $1,
        $2,
        NOW() + INTERVAL '15 minutes'
      )

      ON CONFLICT (correo)
      DO UPDATE SET
        codigo_hash = EXCLUDED.codigo_hash,
        expira_en = EXCLUDED.expira_en,
        intentos = 0,
        verificado = FALSE,
        comprobante_hash = NULL,
        comprobante_expira_en = NULL,
        ultimo_envio = NOW()

      WHERE
        verificaciones_registro.verificado = FALSE
        AND verificaciones_registro.ultimo_envio
          <= NOW() - INTERVAL '60 seconds'

      RETURNING correo`,
      [correo, codigoHash]
    );

    if (resultado.rowCount === 0) {
      await client.query("ROLLBACK");

      return json({
        ok: false,
        mensaje:
          "Espera 60 segundos antes de solicitar otro código."
      }, 429);
    }

    // =========================================
    // ENVIAR CORREO REAL
    // =========================================

    try {
      await enviarCodigoCorreo(correo, codigo);

    } catch (error) {
      // Si falla Gmail, no guardamos el código
      // ni aplicamos la espera por este intento.
      await client.query("ROLLBACK");

      console.error("Error de envío SMTP:", error);

      return json({
        ok: false,
        mensaje:
          "No se pudo enviar el correo. " +
          "Revisa las credenciales SMTP."
      }, 503);
    }

    // Solo guardamos definitivamente el código
    // después de que SMTP acepta el mensaje.
    await client.query("COMMIT");

    return json({
      ok: true,
      mensaje:
        "¡Código enviado! Es válido durante 15 minutos."
    });

  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Error al generar el código:", error);

    return json({
      ok: false,
      mensaje: "No se pudo generar el código."
    }, 500);

  } finally {
    client?.release();
  }
};
