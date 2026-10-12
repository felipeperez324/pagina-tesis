
import type { APIRoute } from "astro";
import bcrypt from "bcrypt";
import { timingSafeEqual } from "node:crypto";

import { db } from "../../lib/db";
import { hashComprobante } from "../../lib/verificacioncorreo";

export const prerender = false;

function responder(datos: object, estado = 200) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export const POST: APIRoute = async ({ request }) => {
  let conexion;

  try {
    const datos = await request.json();

    const nombre = String(datos.nombre ?? "").trim();
    const rut = String(datos.rut ?? "").trim();
    const correo = String(datos.correo ?? "").trim().toLowerCase();
    const tipoUsuario = String(datos.tipoUsuario ?? "");
    const contrasena = datos.contrasena;
    const comprobante = datos.comprobante;

    if (
      !nombre ||
      !rut ||
      !correo ||
      typeof contrasena !== "string" ||
      !contrasena
    ) {
      return responder({
        ok: false,
        mensaje: "Completa todos los campos."
      }, 400);
    }

    if (nombre.length > 100 || rut.length > 12) {
      return responder({
        ok: false,
        mensaje: "El nombre o RUT es demasiado largo."
      }, 400);
    }

    if (
      correo.length > 150 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)
    ) {
      return responder({
        ok: false,
        mensaje: "Correo electrónico inválido."
      }, 400);
    }

    if (contrasena.length < 6 || contrasena.length > 72) {
      return responder({
        ok: false,
        mensaje: "La contraseña debe tener entre 6 y 72 caracteres."
      }, 400);
    }

    // SOLO DOS TIPOS DE CUENTA.
    if (!["adoptante", "organizacion"].includes(tipoUsuario)) {
      return responder({
        ok: false,
        mensaje: "Selecciona un tipo de cuenta válido."
      }, 400);
    }

    if (
      typeof comprobante !== "string" ||
      !/^[a-f0-9]{64}$/.test(comprobante)
    ) {
      return responder({
        ok: false,
        mensaje: "Primero debes verificar tu correo."
      }, 403);
    }

    const contrasenaHash = await bcrypt.hash(contrasena, 12);

    conexion = await db.connect();
    await conexion.query("BEGIN");

    // Comprobar la verificación ANTES de crear usuario.
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
      !registro.verificado ||
      !registro.comprobante_hash ||
      !registro.comprobante_expira_en ||
      new Date(registro.comprobante_expira_en).getTime() <= Date.now()
    ) {
      await conexion.query("ROLLBACK");

      return responder({
        ok: false,
        mensaje: "La verificación expiró. Verifica tu correo nuevamente."
      }, 403);
    }

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
      !timingSafeEqual(hashEsperado, hashRecibido)
    ) {
      await conexion.query("ROLLBACK");

      return responder({
        ok: false,
        mensaje: "El comprobante de verificación no es válido."
      }, 403);
    }

    // El usuario se crea SOLO después de validar.
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
       VALUES ($1, $2, $3, $4, $5, 'activo', TRUE, '')
       RETURNING id`,
      [
        nombre,
        rut,
        correo,
        tipoUsuario,
        contrasenaHash
      ]
    );

    // Impedir reutilizar la misma verificación.
    await conexion.query(
      `DELETE FROM verificaciones_registro
       WHERE correo = $1`,
      [correo]
    );

    await conexion.query("COMMIT");

    return responder({
      ok: true,
      mensaje: "Cuenta creada correctamente.",
      usuarioId: resultado.rows[0].id
    }, 201);

  } catch (error: any) {
    if (conexion) {
      await conexion.query("ROLLBACK").catch(() => {});
    }

    if (error?.code === "23505") {
      return responder({
        ok: false,
        mensaje: "El correo o RUT ya están registrados."
      }, 409);
    }

    console.error("Error de registro:", error);

    return responder({
      ok: false,
      mensaje: "No se pudo crear la cuenta."
    }, 500);

  } finally {
    conexion?.release();
  }
};
