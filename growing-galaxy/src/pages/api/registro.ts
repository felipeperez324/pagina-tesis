
import type { APIRoute } from "astro";
import bcrypt from "bcrypt";
import { db } from "../../lib/db";
import { hashComprobante } from "../../lib/verificacioncorreo";

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
// CREAR CUENTA SOLO CON CORREO VERIFICADO
// =========================================

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json().catch(() => ({}));

    const nombre =
      typeof data.nombre === "string"
        ? data.nombre.trim()
        : "";

    const rut =
      typeof data.rut === "string"
        ? data.rut.trim()
        : "";

    const correo =
      typeof data.correo === "string"
        ? data.correo.trim().toLowerCase()
        : "";

    const tipoUsuario = data.tipoUsuario;
    const contrasena = data.contrasena;
    const comprobante = data.comprobante;

    // =========================================
    // VALIDAR DATOS
    // =========================================

    if (
      !nombre ||
      !rut ||
      !correo ||
      !tipoUsuario ||
      typeof contrasena !== "string" ||
      !contrasena
    ) {
      return json({
        ok: false,
        mensaje: "Todos los campos son obligatorios."
      }, 400);
    }

    if (nombre.length > 100 || rut.length > 12) {
      return json({
        ok: false,
        mensaje: "Nombre o RUT demasiado largo."
      }, 400);
    }

    if (
      correo.length > 150 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)
    ) {
      return json({
        ok: false,
        mensaje: "Correo electrónico inválido."
      }, 400);
    }

    if (contrasena.length < 6) {
      return json({
        ok: false,
        mensaje: "La contraseña debe tener al menos 6 caracteres."
      }, 400);
    }

    if (
      !["adoptante", "rescatista", "veterinario"]
        .includes(tipoUsuario)
    ) {
      return json({
        ok: false,
        mensaje: "Tipo de usuario inválido."
      }, 400);
    }

    // No basta con que el navegador diga
    // que el correo está verificado.
    if (
      typeof comprobante !== "string" ||
      !/^[a-f0-9]{64}$/.test(comprobante)
    ) {
      return json({
        ok: false,
        mensaje: "Debes verificar tu correo antes de registrarte."
      }, 403);
    }

    const comprobanteHash = hashComprobante(comprobante);

    // La contraseña se guarda cifrada mediante hash.
    const hashPassword = await bcrypt.hash(contrasena, 12);

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Bloqueamos la verificación mientras
      // se intenta crear la cuenta.
      const resultado = await client.query(
        `SELECT
          verificado,
          comprobante_hash,
          comprobante_expira_en
         FROM verificaciones_registro
         WHERE correo = $1
         FOR UPDATE`,
        [correo]
      );

      if (resultado.rows.length === 0) {
        await client.query("ROLLBACK");

        return json({
          ok: false,
          mensaje: "No existe una verificación válida para este correo."
        }, 403);
      }

      const verificacion = resultado.rows[0];

      const valido =
        verificacion.verificado === true &&
        verificacion.comprobante_hash === comprobanteHash &&
        verificacion.comprobante_expira_en &&
        new Date(
          verificacion.comprobante_expira_en
        ).getTime() > Date.now();

      if (!valido) {
        await client.query("ROLLBACK");

        return json({
          ok: false,
          mensaje:
            "La verificación no es válida o expiró. " +
            "Solicita otro código."
        }, 403);
      }

      // =========================================
      // AHORA SÍ CREAMOS EL USUARIO
      // =========================================

      await client.query(
        `INSERT INTO usuarios (
          nombre,
          rut,
          correo,
          tipo_usuario,
          contrasena,
          estado_cuenta,
          correo_verificado
        )
        VALUES ($1, $2, $3, $4, $5, 'activo', TRUE)`,
        [
          nombre,
          rut,
          correo,
          tipoUsuario,
          hashPassword
        ]
      );

      // Consumimos el comprobante.
      // No podrá utilizarse para crear otra cuenta.
      await client.query(
        `DELETE FROM verificaciones_registro
         WHERE correo = $1`,
        [correo]
      );

      await client.query("COMMIT");

      return json({
        ok: true,
        mensaje: "¡Cuenta creada correctamente!"
      }, 201);

    } catch (error: any) {
      await client.query("ROLLBACK");

      if (error?.code === "23505") {
        return json({
          ok: false,
          mensaje: "El correo o RUT ya están registrados."
        }, 409);
      }

      throw error;

    } finally {
      client.release();
    }

  } catch (error) {
    console.error("Error al crear cuenta:", error);

    return json({
      ok: false,
      mensaje: "No se pudo crear la cuenta."
    }, 500);
  }
};
