
import type { APIRoute } from "astro";
import bcrypt from "bcrypt";
import { timingSafeEqual } from "node:crypto";

import { db } from "../../lib/db";

import {
  hashComprobante
} from "../../lib/verificacioncorreo";

import {
  leerRegistro
} from "../../lib/serializerUsuario";

export const prerender = false;

// ==========================================
// RESPUESTAS JSON
// ==========================================

function responder(
  datos: Record<string, unknown>,
  estado = 200
): Response {
  return new Response(
    JSON.stringify(datos),
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
// REGISTRO DE USUARIOS
// ==========================================

export const POST: APIRoute = async ({ request }) => {
  let conexion;

// ========================================
// SERIALIZER DE ENTRADA
// ========================================
  try {
        const cuerpo: unknown =
          await request.json().catch(() => null);

        const validacion = leerRegistro(cuerpo);

        if (!validacion.ok) {

          return responder({
            ok: false,
            mensaje: validacion.mensaje
          }, validacion.estado);

        }

        // Datos validados y normalizados.

        const {
          nombre,
          rut,
          rutCompacto,
          correo,
          tipoUsuario,
          contrasena,
          comprobante
        } = validacion.datos;

        // ========================================
        // EVIDENCIA LOCAL DEL SERIALIZER
        // ========================================

        if (import.meta.env.DEV) {

          console.log(
            "[REGISTRO] Datos validados:",
            JSON.stringify({
              nombre,
              tipoUsuario,
              rutValido: true,
              correoFormatoValido: true,
              contrasenaValida: true,
              comprobanteFormatoValido: true
            }, null, 2)
          );

        }



    // Generar hash antes de escribir el usuario.
    const contrasenaHash = await bcrypt.hash(
      contrasena,
      12
    );

    conexion = await db.connect();

    await conexion.query("BEGIN");

    // ========================================
    // COMPROBAR USUARIO DUPLICADO
    // ========================================

    const existente = await conexion.query(
      `
      SELECT id
      FROM usuarios
      WHERE LOWER(correo) = $1
         OR REGEXP_REPLACE(
              UPPER(rut),
              '[^0-9K]',
              '',
              'g'
            ) = $2
      LIMIT 1
      `,
      [correo, rutCompacto]
    );

    if ((existente.rowCount ?? 0) > 0) {
      await conexion.query("ROLLBACK");

      return responder({
        ok: false,
        mensaje:
          "El correo o RUT ya están registrados."
      }, 409);
    }

    // ========================================
    // VALIDAR VERIFICACIÓN DE CORREO
    // ========================================

    const verificacion = await conexion.query(
      `
      SELECT
        verificado,
        comprobante_hash,
        comprobante_expira_en
      FROM verificaciones_registro
      WHERE correo = $1
      FOR UPDATE
      `,
      [correo]
    );

    const registro = verificacion.rows[0];

    if (
      !registro ||
      !registro.verificado ||
      !registro.comprobante_hash ||
      !registro.comprobante_expira_en ||
      new Date(
        registro.comprobante_expira_en
      ).getTime() <= Date.now()
    ) {
      await conexion.query("ROLLBACK");

      return responder({
        ok: false,
        mensaje:
          "La verificación expiró. " +
          "Verifica tu correo nuevamente."
      }, 403);
    }

    // Comparación segura del comprobante.
    const hashEsperado = Buffer.from(
      registro.comprobante_hash,
      "hex"
    );

    const hashRecibido = Buffer.from(
      hashComprobante(comprobante),
      "hex"
    );

    if (
      hashEsperado.length !== 32 ||
      hashRecibido.length !== 32 ||
      !timingSafeEqual(
        hashEsperado,
        hashRecibido
      )
    ) {
      await conexion.query("ROLLBACK");

      return responder({
        ok: false,
        mensaje:
          "El comprobante de verificación " +
          "no es válido."
      }, 403);
    }

    // ========================================
    // CREAR CUENTA
    // ========================================

    const resultado = await conexion.query(
      `
      INSERT INTO usuarios (
        nombre,
        rut,
        correo,
        tipo_usuario,
        contrasena,
        estado_cuenta,
        correo_verificado,
        descripcion_perfil
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        'activo',
        TRUE,
        ''
      )
      RETURNING id
      `,
      [
        nombre,
        rut,
        correo,
        tipoUsuario,
        contrasenaHash
      ]
    );

    // ========================================
    // INVALIDAR VERIFICACIÓN UTILIZADA
    // ========================================

    await conexion.query(
      `
      DELETE FROM verificaciones_registro
      WHERE correo = $1
      `,
      [correo]
    );

    await conexion.query("COMMIT");

    return responder({
      ok: true,
      mensaje:
        "Cuenta creada correctamente.",
      usuarioId: resultado.rows[0].id
    }, 201);

  } catch (error: unknown) {
    if (conexion) {
      await conexion
        .query("ROLLBACK")
        .catch(() => {});
    }

    const codigoError =
      typeof error === "object" &&
      error !== null &&
      "code" in error
        ? error.code
        : undefined;

    if (codigoError === "23505") {
      return responder({
        ok: false,
        mensaje:
          "El correo o RUT ya están registrados."
      }, 409);
    }

    console.error(
      "Error de registro:",
      error
    );

    return responder({
      ok: false,
      mensaje:
        "No se pudo crear la cuenta."
    }, 500);

  } finally {
    conexion?.release();
  }
};
