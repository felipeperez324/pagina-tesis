
import type { APIRoute } from "astro";

import { db } from "../../../lib/db";
import { getUsuarioDesdeSesion } from "../../../lib/auth";

import {
  validarImagen,
  subirImagen,
  borrarImagen,
  ErrorImagen,
  type ImagenValidada
} from "../../../lib/azure";


import { leerMascota } from "../../../lib/serializerMascota";


export const prerender = false;

function responder(
  datos: Record<string, unknown>,
  status = 200
) {
  return new Response(JSON.stringify(datos), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {

  // Verificar el origen de la solicitud.
  const origin = request.headers.get("origin");

  if (origin && origin !== new URL(request.url).origin) {
    return responder({
      ok: false,
      mensaje: "Origen no permitido."
    }, 403);
  }

  // Referencias de archivos nuevos subidos a Azure.
  const blobsNuevos: string[] = [];

  try {
    // ==========================================
    // 1. AUTENTICACIÓN
    // ==========================================

    const usuario = await getUsuarioDesdeSesion(
      cookies.get("session_id")?.value
    );

    if (!usuario) {
      return responder({
        ok: false,
        mensaje: "Inicia sesión."
      }, 401);
    }

    if (usuario.tipo_usuario !== "organizacion") {
      return responder({
        ok: false,
        mensaje: "Sin permisos."
      }, 403);
    }

    const datos = await request.formData();

    const id = Number(datos.get("id"));

    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      id > 2147483647
    ) {
      return responder({
        ok: false,
        mensaje: "ID inválido."
      }, 400);
    }



      // ==========================================
      // 2. SERIALIZER DE MASCOTAS
      // ==========================================

      const validacion = leerMascota(datos);

      if (!validacion.ok) {
        return responder({
          ok: false,
          mensaje: validacion.mensaje
        }, 400);
      }

      const {
        nombre,
        tipo,
        descripcion,
        raza,
        edadMeses,
        sexo,
        tamano,
        ubicacion,
        requisitos,
        personalidad,
        salud,
        esterilizado,
        vacunas
      } = validacion.datos;

      // ==========================================
      // 3. VALIDAR ESTADO DE ADOPCIÓN
      // ==========================================

      const estado = String(
        datos.get("estadoAdopcion") ?? ""
      ).trim();

      if (
        !["disponible", "reservada", "adoptada"]
          .includes(estado)
      ) {
        return responder({
          ok: false,
          mensaje: "Estado de adopción inválido."
        }, 400);
      }
    // ==========================================
    // 5. VALIDAR FOTOGRAFÍAS
    // ==========================================

    // Portada opcional: si no hay archivo,
    // conserva la fotografía principal anterior.
    const portadaNueva = await validarImagen(
      datos.get("foto"),
      true
    );

    // Nuevas fotografías adicionales.
    const archivosGaleria = datos
      .getAll("galeria")
      .filter(
        (valor): valor is File =>
          valor instanceof File && valor.size > 0
      );

    if (archivosGaleria.length > 4) {
      return responder({
        ok: false,
        mensaje: "Máximo cuatro fotos adicionales."
      }, 400);
    }

    const fotosNuevas: ImagenValidada[] = [];

    for (const archivo of archivosGaleria) {
      const validada = await validarImagen(archivo);

      if (validada) {
        fotosNuevas.push(validada);
      }
    }

    // Identificadores de fotografías existentes
    // que la organización marcó para quitar.
    const valoresEliminar = datos.getAll("fotosEliminar");

    if (
      valoresEliminar.length > 4 ||
      valoresEliminar.some(
        (valor) =>
          typeof valor !== "string" ||
          !/^\d+$/.test(valor) ||
          !Number.isSafeInteger(Number(valor)) ||
          Number(valor) < 1
      )
    ) {
      return responder({
        ok: false,
        mensaje: "Selección de fotografías inválida."
      }, 400);
    }

    const idsEliminar = [
      ...new Set(
        valoresEliminar.map((valor) => Number(valor))
      )
    ];

    // ==========================================
    // 6. TRANSACCIÓN POSTGRESQL
    // ==========================================

    const cliente = await db.connect();

    let blobsAntiguos: string[] = [];

    try {
      await cliente.query("BEGIN");

      // Solo puede editar el dueño de la mascota.
      const resultadoMascota = await cliente.query(
        `SELECT id, foto_blob
         FROM mascotas
         WHERE id = $1
           AND usuario_id = $2
         FOR UPDATE`,
        [id, usuario.id]
      );

      if (resultadoMascota.rows.length === 0) {
        await cliente.query("ROLLBACK");

        return responder({
          ok: false,
          mensaje: "Mascota inexistente o sin permisos."
        }, 404);
      }

      const anterior = resultadoMascota.rows[0];

      // Consultar galería actual.
      const galeria = await cliente.query(
        `SELECT id, foto_blob, orden
         FROM mascotas_fotos
         WHERE mascota_id = $1
         ORDER BY orden
         FOR UPDATE`,
        [id]
      );

      const actuales = galeria.rows as {
        id: number | string;
        foto_blob: string;
        orden: number;
      }[];

      // Verificar que las fotos elegidas pertenezcan
      // realmente a esta mascota.
      if (
        idsEliminar.some(
          (idFoto) =>
            !actuales.some(
              (foto) => Number(foto.id) === idFoto
            )
        )
      ) {
        await cliente.query("ROLLBACK");

        return responder({
          ok: false,
          mensaje: "Hay una foto que no pertenece a esta mascota."
        }, 400);
      }

      const seEliminan = actuales.filter(
        (foto) => idsEliminar.includes(Number(foto.id))
      );

      const conservadas = actuales.filter(
        (foto) => !idsEliminar.includes(Number(foto.id))
      );

      // Comprobar el total de fotos adicionales.
      if (conservadas.length + fotosNuevas.length > 4) {
        await cliente.query("ROLLBACK");

        return responder({
          ok: false,
          mensaje: "Solo puedes conservar cuatro fotos adicionales."
        }, 400);
      }

      // ==========================================
      // 7. ACTUALIZAR FOTO PRINCIPAL
      // ==========================================

      let blobPortada: string | null = null;

      if (portadaNueva) {
        blobPortada = await subirImagen(
          "mascotas",
          id,
          portadaNueva
        );

        blobsNuevos.push(blobPortada);
      }

      // ==========================================
      // 8. ACTUALIZAR DATOS
      // ==========================================

      await cliente.query(
        `UPDATE mascotas
         SET
           nombre = $1,
           tipo_mascota = $2,
           descripcion = $3,
           personalidad = $4,
           personalidad_codigo = $5,
           historial_medico = $6,
           salud_codigo = $7,
           estado_adopcion = $8,
           foto_blob = COALESCE($9, foto_blob),
           raza = $10,
           edad_meses = $11,
           sexo = $12,
           tamano = $13,
           esterilizado = $14,
           vacunas_al_dia = $15,
           ubicacion = $16,
           requisitos_adopcion = $17
         WHERE id = $18
           AND usuario_id = $19`,
        [
          nombre,
          tipo,
          descripcion || null,
          personalidad.texto,
          personalidad.codigo,
          salud.texto,
          salud.codigo,
          estado,
          blobPortada,
          raza,
          edadMeses,
          sexo,
          tamano,
          esterilizado,
          vacunas,
          ubicacion,
          requisitos || null,
          id,
          usuario.id
        ]
      );

      // ==========================================
      // 9. QUITAR FOTOS SELECCIONADAS
      // ==========================================

      if (idsEliminar.length) {
        await cliente.query(
          `DELETE FROM mascotas_fotos
           WHERE mascota_id = $1
             AND id = ANY($2::bigint[])`,
          [id, idsEliminar]
        );
      }

      // ==========================================
      // 10. SUBIR NUEVAS FOTOS A AZURE
      // ==========================================

      // Buscar posiciones disponibles entre 1 y 4.
      const ocupadas = new Set(
        conservadas.map((foto) => Number(foto.orden))
      );

      for (const nueva of fotosNuevas) {
        const orden = [1, 2, 3, 4].find(
          (posicion) => !ocupadas.has(posicion)
        );

        if (!orden) {
          throw new Error("No queda espacio para fotografías.");
        }

        const blob = await subirImagen(
          "mascotas",
          id,
          nueva
        );

        blobsNuevos.push(blob);

        await cliente.query(
          `INSERT INTO mascotas_fotos
             (mascota_id, foto_blob, orden)
           VALUES ($1, $2, $3)`,
          [id, blob, orden]
        );

        ocupadas.add(orden);
      }

      // Confirmar los cambios en PostgreSQL.
      await cliente.query("COMMIT");

      // Preparar imágenes antiguas para limpiar Azure.
      blobsAntiguos = seEliminan.map(
        (foto) => foto.foto_blob
      );

      if (blobPortada && anterior.foto_blob) {
        blobsAntiguos.push(String(anterior.foto_blob));
      }

    } catch (error) {
      await cliente.query("ROLLBACK").catch(() => {});
      throw error;

    } finally {
      cliente.release();
    }

    // ==========================================
    // 11. LIMPIAR IMÁGENES ANTIGUAS
    // ==========================================

    // Se eliminan solamente después del COMMIT,
    // para no perderlas si falla PostgreSQL.
    for (const blob of blobsAntiguos) {
      await borrarImagen(blob).catch((error) => {
        console.error(
          "No se pudo limpiar la foto antigua de Azure:",
          error
        );
      });
    }

    return responder({
      ok: true,
      mensaje: "Mascota actualizada correctamente."
    });

  } catch (error) {

    // Si falló la operación, intentar borrar de Azure
    // las imágenes nuevas que se hayan subido.
    for (const blob of blobsNuevos) {
      await borrarImagen(blob).catch(console.error);
    }

    if (error instanceof ErrorImagen) {
      return responder({
        ok: false,
        mensaje: error.message
      }, 400);
    }

    if (
      (error as { constraint?: string }).constraint ===
      "tenencia_activa"
    ) {
      return responder({
        ok: false,
        mensaje: "Cierra la tenencia antes de cambiar disponibilidad."
      }, 409);
    }

    console.error("Error editando mascota:", error);

    return responder({
      ok: false,
      mensaje: "No se pudo actualizar la mascota."
    }, 500);
  }
};
