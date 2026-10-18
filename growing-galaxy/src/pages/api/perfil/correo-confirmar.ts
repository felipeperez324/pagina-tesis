
import type { APIRoute } from "astro";

import { db } from "../../../lib/db";
import { getUsuarioDesdeSesion } from "../../../lib/auth";
import {
  hashCodigo,
  compararCodigos
} from "../../../lib/seguridad/correo";

/**
 * KODAPP - CONFIRMAR CAMBIO DE CORREO
 *
 * Exige código correcto, vigente
 * y con menos de cinco intentos.
 *
 * Al terminar cierra todas las sesiones.
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
  const codigo = datos?.codigo;

  if (
    typeof codigo !== "string" ||
    !/^\d{6}$/.test(codigo)
  ) {
    return responder({ error: "Código inválido." }, 400);
  }

  const conexion = await db.connect();

  try {
    await conexion.query("BEGIN");

    // Bloquear fila para evitar intentos simultáneos.
    const consulta = await conexion.query(
      `SELECT correo_pendiente,
              correo_codigo_hash,
              correo_codigo_expira,
              correo_codigo_intentos,
              correo_codigo_expira > NOW() AS vigente
       FROM usuarios
       WHERE id = $1
       FOR UPDATE`,
      [usuario.id]
    );

    if (consulta.rows.length === 0) {
      await conexion.query("ROLLBACK");
      return responder({ error: "Usuario no encontrado." }, 404);
    }

    const cuenta = consulta.rows[0];

    if (
      !cuenta.correo_pendiente ||
      !cuenta.correo_codigo_hash
    ) {
      await conexion.query("ROLLBACK");
      return responder({
        error: "No existe un cambio pendiente."
      }, 400);
    }

    if (!cuenta.vigente || cuenta.correo_codigo_intentos >= 5) {
      await conexion.query("ROLLBACK");
      return responder({
        error: "Código expirado o intentos agotados."
      }, 400);
    }

    const recibido = hashCodigo(
      usuario.id,
      cuenta.correo_pendiente,
      codigo
    );

    const correcto = compararCodigos(
      cuenta.correo_codigo_hash,
      recibido
    );

    if (!correcto) {
      // Contabilizar intento incorrecto.
      await conexion.query(
        `UPDATE usuarios
         SET correo_codigo_intentos =
             correo_codigo_intentos + 1
         WHERE id = $1`,
        [usuario.id]
      );

      await conexion.query("COMMIT");

      return responder({ error: "Código incorrecto." }, 400);
    }

    // Cambiar correo solamente después de verificar.
    await conexion.query(
      `UPDATE usuarios
       SET correo = correo_pendiente,
           correo_pendiente = NULL,
           correo_codigo_hash = NULL,
           correo_codigo_expira = NULL,
           correo_codigo_enviado = NULL,
           correo_codigo_intentos = 0,
           correo_verificado = TRUE
       WHERE id = $1`,
      [usuario.id]
    );

    // Invalidar todas las sesiones.
    await conexion.query(
      "DELETE FROM sesiones WHERE usuario_id = $1",
      [usuario.id]
    );

    await conexion.query("COMMIT");

    cookies.delete("session_id", { path: "/" });

    return responder({
      success: true,
      mensaje: "Correo cambiado. Inicia sesión nuevamente."
    });

  } catch (error: any) {
    await conexion.query("ROLLBACK").catch(() => {});

    if (error?.code === "23505") {
      return responder({ error: "Correo ya registrado." }, 409);
    }

    console.error("Error confirmando correo:", error);
    return responder({ error: "No se pudo cambiar el correo." }, 500);

  } finally {
    conexion.release();
  }
};
