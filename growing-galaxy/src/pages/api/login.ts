
import type { APIRoute } from "astro";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";

import { db } from "../../lib/db";
import {
  NOMBRE_COOKIE,
  DURACION_SESION
} from "../../lib/seguridad/sesiones";

/**
 * KODAPP - INICIO DE SESIÓN
 *
 * 1. Comprueba correo y contraseña.
 * 2. Comprueba estado de la cuenta.
 * 3. Crea una sesión en PostgreSQL.
 * 4. Guarda la cookie segura.
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
  try {
    const datos = await request.json().catch(() => null);

    if (!datos || typeof datos !== "object") {
      return responder({
        ok: false,
        mensaje: "Solicitud inválida."
      }, 400);
    }

    const correo =
      typeof datos.correo === "string"
        ? datos.correo.trim().toLowerCase()
        : "";

    const contrasena = datos.contrasena;

    if (!correo || typeof contrasena !== "string" || !contrasena) {
      return responder({
        ok: false,
        mensaje: "Correo y contraseña obligatorios."
      }, 400);
    }

    // Buscar la cuenta utilizando el correo.
    const resultado = await db.query(
      `SELECT id,
              nombre,
              correo,
              tipo_usuario,
              contrasena,
              estado_cuenta
       FROM usuarios
       WHERE LOWER(correo) = $1`,
      [correo]
    );

    if (resultado.rows.length === 0) {
      return responder({
        ok: false,
        mensaje: "Correo o contraseña incorrectos."
      }, 401);
    }

    const usuario = resultado.rows[0];

    // Impedir login en cuentas suspendidas.
    if (usuario.estado_cuenta !== "activo") {
      return responder({
        ok: false,
        mensaje: "La cuenta no está activa."
      }, 403);
    }

    // Comparar la clave con su hash bcrypt.
    const correcta = await bcrypt.compare(
      contrasena,
      usuario.contrasena
    );

    if (!correcta) {
      return responder({
        ok: false,
        mensaje: "Correo o contraseña incorrectos."
      }, 401);
    }

    // Crear un identificador aleatorio seguro.
    const sessionId = randomUUID();

    // Revocar la sesión anterior de este navegador,
    // si todavía existe una cookie antigua.
    const sesionAnterior = cookies.get(NOMBRE_COOKIE)?.value;

    if (sesionAnterior) {
      await db.query(
        "DELETE FROM sesiones WHERE id = $1",
        [sesionAnterior]
      );
    }

    // Registrar la nueva sesión.
    await db.query(
      `INSERT INTO sesiones (
         id,
         usuario_id,
         ultima_actividad
       )
       VALUES ($1, $2, NOW())`,
      [sessionId, usuario.id]
    );

    // Configurar cookie de una hora renovable.
    cookies.set(NOMBRE_COOKIE, sessionId, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: "lax",
      path: "/",
      maxAge: DURACION_SESION
    });

    // Mantener formato compatible con login.astro.
    return responder({
      ok: true,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        tipoUsuario: usuario.tipo_usuario
      }
    });

  } catch (error) {
    console.error("Error en login:", error);

    return responder({
      ok: false,
      mensaje: "Error interno del servidor."
    }, 500);
  }
};
