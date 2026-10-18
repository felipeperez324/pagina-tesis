
import type { APIRoute } from "astro";
import bcrypt from "bcrypt";

import { db } from "../../../lib/db";
import { getUsuarioDesdeSesion } from "../../../lib/auth";
import { validarContrasena } from "../../../lib/validarcontrasena";

/**
 * =====================================================
 * KODAPP - ACTUALIZACIÓN DE CUENTA
 * =====================================================
 *
 * Acciones:
 *
 * nombre:
 *   Actualiza el nombre de la cuenta.
 *
 * contrasena:
 *   Cambia la contraseña usando bcrypt.
 *   Revoca todas las sesiones.
 *
 * organizacion:
 *   Convierte Adoptante en Organización.
 *
 * adoptante:
 *   Convierte Organización en Adoptante.
 *   Se bloquea cuando existen publicaciones
 *   de mascotas asociadas a la cuenta.
 *
 * Todas las operaciones requieren sesión válida.
 */

export const prerender = false;

// Respuestas JSON uniformes para configuracion.astro.
function responder(
  datos: Record<string, unknown>,
  estado = 200
): Response {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export const POST: APIRoute = async ({
  request,
  cookies
}) => {
  try {
    // ===============================================
    // 1. VALIDAR EL ORIGEN
    // ===============================================

    const origen = request.headers.get("origin");
    const origenPermitido = new URL(request.url).origin;

    if (origen !== origenPermitido) {
      return responder({
        error: "Origen no permitido."
      }, 403);
    }

    // ===============================================
    // 2. IDENTIFICAR AL USUARIO
    // ===============================================

    const sessionId =
      cookies.get("session_id")?.value;

    const usuario =
      await getUsuarioDesdeSesion(sessionId);

    if (!usuario) {
      return responder({
        error: "Sesión expirada. Inicia sesión nuevamente."
      }, 401);
    }

    // ===============================================
    // 3. OBTENER DATOS DE LA SOLICITUD
    // ===============================================

    const cuerpo: unknown =
      await request.json().catch(() => null);

    if (
      !cuerpo ||
      typeof cuerpo !== "object" ||
      Array.isArray(cuerpo)
    ) {
      return responder({
        error: "Datos inválidos."
      }, 400);
    }

    const datos = cuerpo as Record<string, unknown>;
    const accion = datos.accion;

    // ===============================================
    // ACCIÓN 1: CAMBIAR NOMBRE
    // ===============================================

    if (accion === "nombre") {
      if (typeof datos.nombre !== "string") {
        return responder({
          error: "Debes introducir un nombre."
        }, 400);
      }

      const nombre = datos.nombre
        .trim()
        .normalize("NFC");

      if (nombre.length < 2 || nombre.length > 100) {
        return responder({
          error: "El nombre debe tener entre 2 y 100 caracteres."
        }, 400);
      }

      const resultado = await db.query(
        `UPDATE usuarios
         SET nombre = $1
         WHERE id = $2
           AND estado_cuenta = 'activo'
         RETURNING id`,
        [nombre, usuario.id]
      );

      if (resultado.rows.length === 0) {
        return responder({
          error: "No se pudo actualizar esta cuenta."
        }, 403);
      }

      return responder({
        success: true,
        mensaje: "Nombre actualizado correctamente.",
        nombre
      });
    }

    // ===============================================
    // ACCIÓN 2: CAMBIAR CONTRASEÑA
    // ===============================================

    if (accion === "contrasena") {
      const actual = datos.contrasenaActual;
      const nueva = datos.contrasenaNueva;

      if (
        typeof actual !== "string" ||
        typeof nueva !== "string"
      ) {
        return responder({
          error: "Completa ambas contraseñas."
        }, 400);
      }

      // Misma política de seguridad que el registro.
      const errores = validarContrasena(nueva);

      if (errores.length > 0) {
        return responder({
          error: errores.join(" ")
        }, 400);
      }

      const conexion = await db.connect();
      let transaccionActiva = false;

      try {
        await conexion.query("BEGIN");
        transaccionActiva = true;

        // Bloquear la cuenta durante el cambio.
        const consulta = await conexion.query(
          `SELECT contrasena, estado_cuenta
           FROM usuarios
           WHERE id = $1
           FOR UPDATE`,
          [usuario.id]
        );

        if (consulta.rows.length === 0) {
          await conexion.query("ROLLBACK");
          transaccionActiva = false;

          return responder({
            error: "Usuario no encontrado."
          }, 404);
        }

        const cuenta = consulta.rows[0];

        if (cuenta.estado_cuenta !== "activo") {
          await conexion.query("ROLLBACK");
          transaccionActiva = false;

          return responder({
            error: "La cuenta no está activa."
          }, 403);
        }

        // Comparar con el hash de la contraseña actual.
        const correcta = await bcrypt.compare(
          actual,
          cuenta.contrasena
        );

        if (!correcta) {
          await conexion.query("ROLLBACK");
          transaccionActiva = false;

          return responder({
            error: "La contraseña actual es incorrecta."
          }, 403);
        }

        // No permitir reutilizar la misma contraseña.
        const repetida = await bcrypt.compare(
          nueva,
          cuenta.contrasena
        );

        if (repetida) {
          await conexion.query("ROLLBACK");
          transaccionActiva = false;

          return responder({
            error: "La contraseña nueva debe ser diferente."
          }, 400);
        }

        // Guardar el nuevo hash bcrypt.
        const nuevoHash = await bcrypt.hash(nueva, 12);

        await conexion.query(
          `UPDATE usuarios
           SET contrasena = $1
           WHERE id = $2`,
          [nuevoHash, usuario.id]
        );

        // Cerrar todas las sesiones por seguridad.
        await conexion.query(
          `DELETE FROM sesiones
           WHERE usuario_id = $1`,
          [usuario.id]
        );

        await conexion.query("COMMIT");
        transaccionActiva = false;

        cookies.delete("session_id", { path: "/" });

        return responder({
          success: true,
          mensaje:
            "Contraseña actualizada. Inicia sesión nuevamente."
        });

      } catch (error) {
        if (transaccionActiva) {
          await conexion.query("ROLLBACK").catch(() => {});
        }

        console.error("Error al cambiar contraseña:", error);

        return responder({
          error: "No se pudo cambiar la contraseña."
        }, 500);

      } finally {
        conexion.release();
      }
    }

    // ===============================================
    // ACCIÓN 3: CAMBIAR TIPO DE CUENTA
    // ===============================================

    if (
      accion === "organizacion" ||
      accion === "adoptante"
    ) {
      const contrasenaActual = datos.contrasenaActual;

      if (
        typeof contrasenaActual !== "string" ||
        contrasenaActual.length === 0
      ) {
        return responder({
          error: "Debes confirmar tu contraseña."
        }, 400);
      }

      // Convertir la acción solicitada al nuevo rol.
      const nuevoTipo = accion;

      // El cambio debe ser entre roles diferentes.
      const tipoEsperado =
        nuevoTipo === "organizacion"
          ? "adoptante"
          : "organizacion";

      const conexion = await db.connect();
      let transaccionActiva = false;

      try {
        await conexion.query("BEGIN");
        transaccionActiva = true;

        // Bloquear usuario para proteger el cambio.
        const consulta = await conexion.query(
          `SELECT
             contrasena,
             tipo_usuario,
             estado_cuenta
           FROM usuarios
           WHERE id = $1
           FOR UPDATE`,
          [usuario.id]
        );

        if (consulta.rows.length === 0) {
          await conexion.query("ROLLBACK");
          transaccionActiva = false;

          return responder({
            error: "Usuario no encontrado."
          }, 404);
        }

        const cuenta = consulta.rows[0];

        if (cuenta.estado_cuenta !== "activo") {
          await conexion.query("ROLLBACK");
          transaccionActiva = false;

          return responder({
            error: "La cuenta no está activa."
          }, 403);
        }

        // Debe estar en el tipo anterior esperado.
        if (cuenta.tipo_usuario !== tipoEsperado) {
          await conexion.query("ROLLBACK");
          transaccionActiva = false;

          return responder({
            error:
              "El tipo de cuenta actual no permite este cambio."
          }, 400);
        }

        // Verificar contraseña del titular.
        const correcta = await bcrypt.compare(
          contrasenaActual,
          cuenta.contrasena
        );

        if (!correcta) {
          await conexion.query("ROLLBACK");
          transaccionActiva = false;

          return responder({
            error: "Contraseña incorrecta."
          }, 403);
        }

        // ===========================================
        // REGLA ESPECIAL: ORGANIZACIÓN A ADOPTANTE
        // ===========================================

        if (nuevoTipo === "adoptante") {

          // Verificar publicaciones asociadas a
          // esta organización mediante usuario_id.
          //
          // Incluye mascotas disponibles,
          // reservadas y adoptadas que sigan
          // registradas en la base de datos.
          const mascotas = await conexion.query(
            `SELECT COUNT(*)::integer AS cantidad
             FROM mascotas
             WHERE usuario_id = $1`,
            [usuario.id]
          );

          const cantidad = Number(
            mascotas.rows[0]?.cantidad ?? 0
          );

          if (cantidad > 0) {
            await conexion.query("ROLLBACK");
            transaccionActiva = false;

            return responder({
              error:
                `No puedes cambiar a Adoptante porque tienes ` +
                `${cantidad} publicación(es) de mascotas asociadas ` +
                `a tu organización. Debes resolverlas antes ` +
                `de cambiar de cuenta.`,
              codigo: "MASCOTAS_PUBLICADAS",
              cantidadMascotas: cantidad
            }, 409);
          }
        }

        // ===========================================
        // REALIZAR EL CAMBIO DE TIPO
        // ===========================================

        // Solo se modifica tipo_usuario.
        // Se mantienen nombre, correo, RUT,
        // contraseña y descripción.
        const cambio = await conexion.query(
          `UPDATE usuarios
           SET tipo_usuario = $1
           WHERE id = $2
             AND tipo_usuario = $3
           RETURNING tipo_usuario`,
          [nuevoTipo, usuario.id, tipoEsperado]
        );

        if (cambio.rows.length === 0) {
          await conexion.query("ROLLBACK");
          transaccionActiva = false;

          return responder({
            error: "No se pudo completar el cambio de cuenta."
          }, 409);
        }

        await conexion.query("COMMIT");
        transaccionActiva = false;

        return responder({
          success: true,
          mensaje:
            nuevoTipo === "organizacion"
              ? "Tu cuenta ahora es de tipo Organización."
              : "Tu cuenta ahora es de tipo Adoptante.",
          tipo_usuario: nuevoTipo
        });

      } catch (error) {
        if (transaccionActiva) {
          await conexion.query("ROLLBACK").catch(() => {});
        }

        console.error("Error al cambiar tipo de cuenta:", error);

        return responder({
          error: "No se pudo cambiar el tipo de cuenta."
        }, 500);

      } finally {
        conexion.release();
      }
    }

    // ===============================================
    // ACCIÓN DESCONOCIDA
    // ===============================================

    return responder({
      error: "Acción no válida."
    }, 400);

  } catch (error) {
    console.error("Error general de perfil:", error);

    return responder({
      error: "Error interno al actualizar la cuenta."
    }, 500);
  }
};
