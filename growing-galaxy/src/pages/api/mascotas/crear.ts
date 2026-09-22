// Importamos el tipo APIRoute de Astro.
import type { APIRoute } from "astro";

// Importamos la conexión con PostgreSQL.
import { db } from "../../../lib/db";

// Importamos la función que obtiene
// el usuario desde su sesión.
import { getUsuarioDesdeSesion } from "../../../lib/auth";

// Este endpoint se ejecuta en el servidor.
export const prerender = false;


// =========================================
// CREAR MASCOTA
// =========================================
//
// Este endpoint recibe los datos del formulario
// de publicación de mascotas y los guarda
// en la tabla mascotas.
export const POST: APIRoute = async ({ request, cookies }) => {

  try {

    // =========================================
    // COMPROBAR SESIÓN
    // =========================================

    // Obtenemos el ID de sesión desde la cookie.
    const sessionId = cookies.get("session_id")?.value;

    // Buscamos al usuario que corresponde
    // a esa sesión.
    const usuario = await getUsuarioDesdeSesion(sessionId);


    // Si no existe una sesión válida,
    // no permitimos publicar mascotas.
    if (!usuario) {

      return new Response(
        JSON.stringify({
          ok: false,
          mensaje: "No estás autenticado.",
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }


    // =========================================
    // COMPROBAR PERMISOS
    // =========================================

    // Solamente los rescatistas y veterinarios
    // pueden publicar mascotas.
    if (
      usuario.tipo_usuario !== "rescatista" &&
      usuario.tipo_usuario !== "veterinario"
    ) {

      return new Response(
        JSON.stringify({
          ok: false,
          mensaje: "No tienes permisos para publicar mascotas.",
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }


    // =========================================
    // OBTENER DATOS DEL FORMULARIO
    // =========================================

    // El formulario se envía utilizando FormData
    // porque también permite enviar imágenes.
    const formData = await request.formData();


    // Obtenemos el nombre de la mascota.
    const nombre =
      formData.get("nombre")?.toString().trim();

    // Obtenemos el tipo de mascota.
    const tipoMascota =
      formData.get("tipoMascota")?.toString();

    // Obtenemos la descripción.
    const descripcion =
      formData.get("descripcion")?.toString().trim();

    // Obtenemos la personalidad.
    const personalidad =
      formData.get("personalidad")?.toString().trim();

    // Obtenemos el historial médico.
    const historialMedico =
      formData
        .get("historialMedico")
        ?.toString()
        .trim();

    // Obtenemos la imagen.
    const archivo = formData.get("foto");


    // =========================================
    // VALIDAR CAMPOS OBLIGATORIOS
    // =========================================

    // El nombre y el tipo son obligatorios.
    if (!nombre || !tipoMascota) {

      return new Response(
        JSON.stringify({
          ok: false,
          mensaje:
            "El nombre y el tipo de mascota son obligatorios.",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }


    // =========================================
    // VALIDAR TIPO DE MASCOTA
    // =========================================

    // Solo permitimos los tipos definidos
    // por el sistema.
    if (
      !["perro", "gato", "otro"].includes(tipoMascota)
    ) {

      return new Response(
        JSON.stringify({
          ok: false,
          mensaje: "El tipo de mascota no es válido.",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }


    // =========================================
    // PROCESAR IMAGEN
    // =========================================

    // Inicialmente no tenemos ninguna imagen.
    let imagenBase64: string | null = null;


    // Si se recibió un archivo y tiene contenido,
    // comenzamos a validarlo.
    if (
      archivo instanceof File &&
      archivo.size > 0
    ) {

      // Comprobamos que sea una imagen.
      if (!archivo.type.startsWith("image/")) {

        return new Response(
          JSON.stringify({
            ok: false,
            mensaje: "El archivo debe ser una imagen.",
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }


      // Comprobamos que no supere los 5 MB.
      if (
        archivo.size > 5 * 1024 * 1024
      ) {

        return new Response(
          JSON.stringify({
            ok: false,
            mensaje:
              "La imagen no puede superar los 5 MB.",
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }


      // Convertimos el archivo a Buffer.
      const buffer = Buffer.from(
        await archivo.arrayBuffer()
      );


      // Convertimos la imagen a Base64.
      imagenBase64 =
        `data:${archivo.type};base64,${buffer.toString("base64")}`;
    }


    // =========================================
    // GUARDAR MASCOTA EN POSTGRESQL
    // =========================================

    // Insertamos la nueva mascota.
    //
    // usuario_id permite saber quién publicó
    // la mascota.
    //
    // estado_adopcion comienza como "disponible".
    const resultado = await db.query(
      `INSERT INTO mascotas (
        usuario_id,
        nombre,
        descripcion,
        personalidad,
        historial_medico,
        estado_adopcion,
        tipo_mascota,
        foto
      )
      VALUES ($1, $2, $3, $4, $5, 'disponible', $6, $7)
      RETURNING id`,

      [
        usuario.id,
        nombre,
        descripcion || null,
        personalidad || null,
        historialMedico || null,
        tipoMascota,
        imagenBase64,
      ]
    );


    // =========================================
    // RESPUESTA EXITOSA
    // =========================================

    // Devolvemos el ID de la mascota creada.
    return new Response(
      JSON.stringify({
        ok: true,
        mensaje:
          "Mascota publicada correctamente.",
        mascotaId:
          resultado.rows[0].id,
      }),
      {
        status: 201,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );


  } catch (error) {

    // Mostramos el error real en la consola
    // para poder identificar problemas.
    console.error(
      "Error al publicar mascota:",
      error
    );


    // Mensaje que recibe el navegador.
    return new Response(
      JSON.stringify({
        ok: false,
        mensaje:
          "No se pudo publicar la mascota.",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
};