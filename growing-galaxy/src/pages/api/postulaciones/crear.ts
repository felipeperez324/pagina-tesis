
import type { APIRoute } from "astro";
import { db } from "../../../lib/db";
import { getUsuarioDesdeSesion } from "../../../lib/auth";
import {leerPostulacion, responderPostulacion as responder } from "../../../lib/postulacion";
import { comprobarCupo, ReglaAdopcion } from "../../../lib/adopcion";
import { enviarAvisoKodaApp } from "../../../lib/notificacionesCorreo";

export const prerender = false;

/**
 * KODAPP - CREAR POSTULACIÓN
 *
 * Solo permite postular a usuarios adoptantes.
 * Comprueba los datos y evita postulaciones duplicadas.
 * No modifica el estado de adopción de la mascota.
 */



export const POST: APIRoute = async ({
  request,
  cookies
}) => {
  // Evitar solicitudes desde otro origen.
  if (
    request.headers.get("origin") !==
    new URL(request.url).origin
  ) {
    return responder({
      ok: false,
      mensaje: "Origen no permitido."
    }, 403);
  }

  const usuario = await getUsuarioDesdeSesion(
    cookies.get("session_id")?.value
  );

  if (!usuario) {
    return responder({
      ok: false,
      mensaje: "Debes iniciar sesión."
    }, 401);
  }

  if (usuario.tipo_usuario !== "adoptante") {
    return responder({
      ok: false,
      mensaje: "Solo los adoptantes pueden postular."
    }, 403);
  }

  let entrada;
  try {
    entrada = leerPostulacion(await request.json().catch(() => null));
  } catch (error) {
    return responder({ ok: false, mensaje: (error as Error).message }, 400);
  }
  const { mascotaId, telefono, vivienda, motivo } = entrada;

  const conexion = await db.connect();

  try {
    await conexion.query("BEGIN");

    // Bloquear al adoptante durante la postulación.
    // Evita que dos solicitudes simultáneas superen
    // los límites establecidos.
    await conexion.query(
      `SELECT id
      FROM usuarios
      WHERE id = $1
      FOR UPDATE`,
      [usuario.id]
    );

    

    // Bloquea la mascota durante el registro para
    // evitar decisiones simultáneas incompatibles.
    const consultaMascota = await conexion.query(
      `SELECT id, usuario_id, estado_adopcion
       FROM mascotas
       WHERE id = $1
        AND publicada = TRUE
       FOR UPDATE`,
      [mascotaId]
    );

    if (consultaMascota.rows.length === 0) {
      await conexion.query("ROLLBACK");

      return responder({
        ok: false,
        mensaje: "La mascota no existe."
      }, 404);
    }

    const mascota = consultaMascota.rows[0];

    if (mascota.estado_adopcion !== "disponible") {
      await conexion.query("ROLLBACK");

      return responder({
        ok: false,
        mensaje: "Esta mascota ya no recibe postulaciones."
      }, 409);
    }

    if (Number(mascota.usuario_id) === Number(usuario.id)) {
      await conexion.query("ROLLBACK");

      return responder({
        ok: false,
        mensaje: "No puedes postular a tu propia mascota."
      }, 403);
    }

    const organizacion = await conexion.query(
      "SELECT estado_cuenta FROM usuarios WHERE id = $1 FOR SHARE", [mascota.usuario_id]
    );
    if (organizacion.rows[0]?.estado_cuenta !== "activo") {
      throw new ReglaAdopcion("La organización está suspendida.", 403);
    }
    await comprobarCupo(conexion, usuario.id);

    // ==========================================
    // LÍMITE DE POSTULACIONES DEL ADOPTANTE
    // ==========================================

    const MAX_PENDIENTES = 3;
    const MAX_DIARIAS = 3;

    const consultaLimites = await conexion.query(
      `SELECT
        COUNT(*) FILTER (
          WHERE estado = 'pendiente'
        )::integer AS pendientes,

        COUNT(*) FILTER (
          WHERE
            (creada_en AT TIME ZONE 'America/Santiago')::date =
            (CURRENT_TIMESTAMP AT TIME ZONE 'America/Santiago')::date
        )::integer AS enviadas_hoy

      FROM postulaciones
      WHERE adoptante_id = $1`,
      [usuario.id]
    );

    const pendientes = Number(
      consultaLimites.rows[0].pendientes
    );

    const enviadasHoy = Number(
      consultaLimites.rows[0].enviadas_hoy
    );

    // Máximo tres pendientes al mismo tiempo.
    if (pendientes >= MAX_PENDIENTES) {
      throw new ReglaAdopcion(
        "Ya tienes 3 postulaciones pendientes. Espera una respuesta o retira una solicitud antes de postular nuevamente.",
        409
      );
    }

    // Máximo tres postulaciones enviadas por día.
    if (enviadasHoy >= MAX_DIARIAS) {
      throw new ReglaAdopcion(
        "Alcanzaste el límite de 3 postulaciones diarias. Podrás volver a postular mañana.",
        429
      );
    }


    // Una postulación aprobada cierra nuevas
    // solicitudes para esa mascota.
    const aprobada = await conexion.query(
      `SELECT id
       FROM postulaciones
       WHERE mascota_id = $1
         AND estado = 'aprobada' AND fin_tenencia IS NULL 
       LIMIT 1`,
      [mascotaId]
    );

    if (aprobada.rows.length > 0) {
      await conexion.query("ROLLBACK");

      return responder({
        ok: false,
        mensaje:
          "Esta mascota ya tiene una postulación aprobada."
      }, 409);
    }

    // Evitar duplicados del mismo adoptante.
    const duplicada = await conexion.query(
      `SELECT id
       FROM postulaciones
       WHERE mascota_id = $1
         AND adoptante_id = $2
       LIMIT 1`,
      [mascotaId, usuario.id]
    );

    if (duplicada.rows.length > 0) {
      await conexion.query("ROLLBACK");

      return responder({
        ok: false,
        mensaje: "Ya postulaste para esta mascota."
      }, 409);
    }

    await conexion.query(
      `INSERT INTO postulaciones (
         mascota_id,
         adoptante_id,
         telefono,
         vivienda,
         motivo,
         estado
       )
       VALUES ($1, $2, $3, $4, $5, 'pendiente')`,
      [
        mascotaId,
        usuario.id,
        telefono,
        vivienda,
        motivo
      ]
    );


      await conexion.query("COMMIT");

      // Notificar después de confirmar PostgreSQL.
      try {
        const informacion = await db.query(
          `SELECT
            m.nombre AS mascota,
            a.nombre AS adoptante,
            a.correo AS correo_adoptante,
            o.correo AS correo_organizacion
          FROM mascotas m
          JOIN usuarios o ON o.id = m.usuario_id
          JOIN usuarios a ON a.id = $2
          WHERE m.id = $1`,
          [mascotaId, usuario.id]
        );

        const datosCorreo = informacion.rows[0];

        if (datosCorreo) {
          const resultados = await Promise.allSettled([
            enviarAvisoKodaApp({
              para: datosCorreo.correo_adoptante,
              asunto: "Postulación recibida",
              titulo: "¡Recibimos tu postulación!",
              mensaje:
                "Tu solicitud fue registrada correctamente. " +
                "La organización revisará la información enviada.",
              detalle: `Mascota: ${datosCorreo.mascota}`
            }),

            enviarAvisoKodaApp({
              para: datosCorreo.correo_organizacion,
              asunto: "Nueva postulación de adopción",
              titulo: "Tienes una nueva postulación",
              mensaje:
                `${datosCorreo.adoptante} ha enviado una ` +
                "solicitud de adopción. Ingresa a tu panel " +
                "para revisarla.",
              detalle: `Mascota: ${datosCorreo.mascota}`
            })
          ]);

          resultados.forEach((resultado) => {
            if (resultado.status === "rejected") {
              console.error(
                "No se pudo enviar una notificación:",
                resultado.reason
              );
            }
          });
        }

      } catch (error) {
        console.error(
          "Error preparando notificaciones de postulación:",
          error
        );
      }

      return responder({
        ok: true,
        mensaje: "Tu postulación fue enviada correctamente."
      }, 201);


  } catch (error) {
    await conexion.query("ROLLBACK").catch(() => {});

    if (error instanceof ReglaAdopcion) return responder({ ok: false, mensaje: error.message }, error.status);
    const codigo =
      (error as { code?: string }).code;

    if (codigo === "23505") {
      return responder({
        ok: false,
        mensaje: "Ya existe una postulación para esta mascota."
      }, 409);
    }

    console.error("Error al crear postulación:", error);

    return responder({
      ok: false,
      mensaje: "Error al guardar la postulación."
    }, 500);

  } finally {
    conexion.release();
  }
};
