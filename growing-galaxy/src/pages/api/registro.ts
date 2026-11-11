
import type { APIRoute } from "astro";
import bcrypt from "bcrypt";
import { timingSafeEqual } from "node:crypto";

import { db } from "../../lib/db";

import {
  hashComprobante
} from "../../lib/verificacioncorreo";

import {
  validarContrasena
} from "../../lib/validarContrasena";

import {
  validarRut,
  formatearRut
} from "../../lib/rut";

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

  try {
    const datos = await request
      .json()
      .catch(() => ({}));

    const nombre = String(
      datos.nombre ?? ""
    ).trim();

    const rutEntrada = String(
      datos.rut ?? ""
    ).trim();

    const correo = String(
      datos.correo ?? ""
    ).trim().toLowerCase();

    const tipoUsuario = String(
      datos.tipoUsuario ?? ""
    );

    const contrasena = datos.contrasena;
    const comprobante = datos.comprobante;

    // ========================================
    // CAMPOS OBLIGATORIOS
    // ========================================

    if (
      !nombre ||
      !rutEntrada ||
      !correo ||
      typeof contrasena !== "string" ||
      !contrasena
    ) {
      return responder({
        ok: false,
        mensaje: "Completa todos los campos."
      }, 400);
    }

    if (nombre.length > 100) {
      return responder({
        ok: false,
        mensaje:
          "El nombre no puede superar 100 caracteres."
      }, 400);
    }

    // ========================================
    // VALIDACIÓN DE RUT MÓDULO 11
    // ========================================

    if (!validarRut(rutEntrada)) {
      return responder({
        ok: false,
        mensaje:
          "El RUT ingresado no tiene un dígito " +
          "verificador válido. Revisa los datos."
      }, 400);
    }

    // Mantener formato tradicional en PostgreSQL.
    const rut = formatearRut(rutEntrada);

    if (rut.length > 12) {
      return responder({
        ok: false,
        mensaje: "El formato del RUT es inválido."
      }, 400);
    }

    // Se utiliza para buscar duplicados aunque
    // existan registros antiguos con otros formatos.
    const rutCompacto = rut
      .toUpperCase()
      .replace(/[^0-9K]/g, "");

    // ========================================
    // VALIDACIÓN DE CORREO
    // ========================================

    if (
      correo.length > 150 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)
    ) {
      return responder({
        ok: false,
        mensaje: "Correo electrónico inválido."
      }, 400);
    }

    // ========================================
    // VALIDACIÓN DE CONTRASEÑA
    // ========================================

    if (
      contrasena.length > 72 ||
      Buffer.byteLength(contrasena, "utf8") > 72
    ) {
      return responder({
        ok: false,
        mensaje:
          "La contraseña es demasiado larga."
      }, 400);
    }

    const erroresContrasena =
      validarContrasena(contrasena);

    if (erroresContrasena.length > 0) {
      return responder({
        ok: false,
        mensaje: erroresContrasena.join(" ")
      }, 400);
    }

    // ========================================
    // ROLES PERMITIDOS
    // ========================================

    if (
      !["adoptante", "organizacion"]
        .includes(tipoUsuario)
    ) {
      return responder({
        ok: false,
        mensaje:
          "Selecciona un tipo de cuenta válido."
      }, 400);
    }

    // ========================================
    // COMPROBANTE DE VERIFICACIÓN
    // ========================================

    if (
      typeof comprobante !== "string" ||
      !/^[a-f0-9]{64}$/.test(comprobante)
    ) {
      return responder({
        ok: false,
        mensaje:
          "Primero debes verificar tu correo."
      }, 403);
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
