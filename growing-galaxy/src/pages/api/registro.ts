
import type { APIRoute } from "astro";

import bcrypt from "bcrypt";
import { timingSafeEqual } from "node:crypto";

import { db } from "../../lib/db";
import { hashComprobante } from "../../lib/verificacioncorreo";
import { validarContrasena } from "../../lib/validarcontrasena";

/**
 * =====================================================
 * KODAPP - REGISTRO SEGURO DE USUARIOS
 * =====================================================
 *
 * - Validación de nombre, RUT y correo.
 * - Validación de contraseñas seguras.
 * - Verificación obligatoria del correo.
 * - Hash bcrypt de la contraseña.
 * - Registro en PostgreSQL.
 * - Transacción con rollback ante errores.
 */

export const prerender = false;

/**
 * Enviar una respuesta JSON al navegador.
 */
function responder(
  datos: Record<string, unknown>,
  estado: number = 200
): Response {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

/**
 * Obtener el código de error de PostgreSQL
 * sin utilizar el tipo any.
 */
function obtenerCodigoError(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return undefined;
}

/**
 * POST /api/registro
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // ==========================================
    // 1. RECIBIR DATOS
    // ==========================================

    const datos: unknown = await request.json().catch(() => null);

    if (
      datos === null ||
      typeof datos !== "object" ||
      Array.isArray(datos)
    ) {
      return responder({
        ok: false,
        mensaje: "Solicitud inválida."
      }, 400);
    }

    const cuerpo = datos as Record<string, unknown>;

    const nombre =
      typeof cuerpo.nombre === "string"
        ? cuerpo.nombre.trim()
        : "";

    const rut =
      typeof cuerpo.rut === "string"
        ? cuerpo.rut.trim()
        : "";

    const correo =
      typeof cuerpo.correo === "string"
        ? cuerpo.correo.trim().toLowerCase()
        : "";

    const tipoUsuario =
      typeof cuerpo.tipoUsuario === "string"
        ? cuerpo.tipoUsuario
        : "";

    const contrasena = cuerpo.contrasena;
    const comprobante = cuerpo.comprobante;

    // ==========================================
    // 2. CAMPOS OBLIGATORIOS
    // ==========================================

    if (
      !nombre ||
      !rut ||
      !correo ||
      typeof contrasena !== "string" ||
      contrasena.length === 0
    ) {
      return responder({
        ok: false,
        mensaje: "Debes completar todos los campos."
      }, 400);
    }

    // ==========================================
    // 3. LONGITUDES
    // ==========================================

    if (
      nombre.length > 100 ||
      rut.length > 12
    ) {
      return responder({
        ok: false,
        mensaje: "El nombre o RUT es demasiado largo."
      }, 400);
    }

    // ==========================================
    // 4. VALIDAR CORREO
    // ==========================================

    const formatoCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      correo.length > 150 ||
      !formatoCorreo.test(correo)
    ) {
      return responder({
        ok: false,
        mensaje: "Correo electrónico inválido."
      }, 400);
    }

    // ==========================================
    // 5. VALIDAR CONTRASEÑA
    // ==========================================

    const errores = validarContrasena(contrasena);

    if (errores.length > 0) {
      return responder({
        ok: false,
        mensaje: errores.join(" ")
      }, 400);
    }

    // ==========================================
    // 6. TIPO DE CUENTA
    // ==========================================

    if (
      !["adoptante", "organizacion"].includes(tipoUsuario)
    ) {
      return responder({
        ok: false,
        mensaje: "Selecciona un tipo de cuenta válido."
      }, 400);
    }

    // ==========================================
    // 7. VERIFICACIÓN DEL CORREO
    // ==========================================

    if (
      typeof comprobante !== "string" ||
      !/^[a-f0-9]{64}$/.test(comprobante)
    ) {
      return responder({
        ok: false,
        mensaje: "Primero debes verificar tu correo."
      }, 403);
    }

    // ==========================================
    // 8. HASH DE CONTRASEÑA
    // ==========================================

    const contrasenaHash = await bcrypt.hash(
      contrasena,
      12
    );

    // ==========================================
    // 9. CONEXIÓN POSTGRESQL
    // ==========================================

    // Usar const evita el problema de tipos
    // que existía en el código anterior.
    const conexion = await db.connect();

    let transaccionActiva = false;

    try {
      await conexion.query("BEGIN");
      transaccionActiva = true;

      // ========================================
      // 10. COMPROBAR CORREO VERIFICADO
      // ========================================

      const verificacion = await conexion.query(
        `SELECT
           verificado,
           comprobante_hash,
           comprobante_expira_en
         FROM verificaciones_registro
         WHERE correo = $1
         FOR UPDATE`,
        [correo]
      );

      const registro = verificacion.rows[0];

      if (
        !registro ||
        registro.verificado !== true ||
        typeof registro.comprobante_hash !== "string" ||
        !registro.comprobante_expira_en ||
        new Date(
          registro.comprobante_expira_en
        ).getTime() <= Date.now()
      ) {
        await conexion.query("ROLLBACK");
        transaccionActiva = false;

        return responder({
          ok: false,
          mensaje: "La verificación expiró. Verifica tu correo nuevamente."
        }, 403);
      }

      // ========================================
      // 11. COMPARAR COMPROBANTE
      // ========================================

      const hashEsperado = registro.comprobante_hash;
      const hashRecibido = hashComprobante(comprobante);

      if (
        !/^[a-f0-9]{64}$/i.test(hashEsperado) ||
        !/^[a-f0-9]{64}$/i.test(hashRecibido)
      ) {
        await conexion.query("ROLLBACK");
        transaccionActiva = false;

        return responder({
          ok: false,
          mensaje: "Comprobante de verificación inválido."
        }, 403);
      }

      const esperado = Buffer.from(
        hashEsperado,
        "hex"
      );

      const recibido = Buffer.from(
        hashRecibido,
        "hex"
      );

      const valido = timingSafeEqual(
        esperado,
        recibido
      );

      if (!valido) {
        await conexion.query("ROLLBACK");
        transaccionActiva = false;

        return responder({
          ok: false,
          mensaje: "Comprobante de correo incorrecto."
        }, 403);
      }

      // ========================================
      // 12. CREAR USUARIO
      // ========================================

      // La columna "contrasena" guarda el hash,
      // no la contraseña original.
      const resultado = await conexion.query(
        `INSERT INTO usuarios (
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
           $1, $2, $3, $4, $5,
           'activo', TRUE, ''
         )
         RETURNING id`,
        [
          nombre,
          rut,
          correo,
          tipoUsuario,
          contrasenaHash
        ]
      );

      // ========================================
      // 13. INVALIDAR COMPROBANTE
      // ========================================

      await conexion.query(
        `DELETE FROM verificaciones_registro
         WHERE correo = $1`,
        [correo]
      );

      // ========================================
      // 14. CONFIRMAR REGISTRO
      // ========================================

      await conexion.query("COMMIT");
      transaccionActiva = false;

      return responder({
        ok: true,
        mensaje: "Cuenta creada correctamente.",
        usuarioId: resultado.rows[0].id
      }, 201);

    } catch (error: unknown) {
      // ========================================
      // 15. CONTROL DE ERRORES SQL
      // ========================================

      if (transaccionActiva) {
        await conexion.query("ROLLBACK").catch(() => {});
      }

      if (obtenerCodigoError(error) === "23505") {
        return responder({
          ok: false,
          mensaje: "El correo o RUT ya está registrado."
        }, 409);
      }

      console.error("Error de registro en PostgreSQL:", error);

      return responder({
        ok: false,
        mensaje: "No se pudo crear la cuenta."
      }, 500);

    } finally {
      // ========================================
      // 16. LIBERAR CONEXIÓN
      // ========================================

      conexion.release();
    }

  } catch (error: unknown) {
    console.error("Error general de registro:", error);

    return responder({
      ok: false,
      mensaje: "Error interno del servidor."
    }, 500);
  }
};
