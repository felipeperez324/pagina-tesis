// Importamos el tipo APIRoute de Astro para definir
// correctamente nuestro endpoint.
import type { APIRoute } from "astro";

// Importamos la conexión con PostgreSQL.
import { db } from "../../../lib/db";

// Importamos la función que permite obtener
// el usuario asociado a una sesión.
import { getUsuarioDesdeSesion } from "../../../lib/auth";

// Este endpoint se ejecuta en el servidor.
export const prerender = false;


// Endpoint POST utilizado para cambiar la foto de perfil.
export const POST: APIRoute = async ({ request, cookies }) => {

  try {

    // =========================================
    // COMPROBAR SESIÓN
    // =========================================

    // Obtenemos el ID de sesión almacenado
    // en la cookie del navegador.
    const sessionId = cookies.get("session_id")?.value;

    // Buscamos el usuario asociado a esa sesión.
    const usuario = await getUsuarioDesdeSesion(sessionId);

    // Si no existe un usuario válido,
    // significa que no está autenticado.
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
    // OBTENER ARCHIVO ENVIADO
    // =========================================

    // Obtenemos los datos enviados mediante FormData.
    const formData = await request.formData();

    // Buscamos el archivo que llegó
    // con el nombre "foto".
    const archivo = formData.get("foto");


    // Comprobamos que realmente se haya enviado
    // un archivo.
    if (!(archivo instanceof File)) {

      return new Response(
        JSON.stringify({
          ok: false,
          mensaje: "No se recibió ninguna imagen.",
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
    // COMPROBAR TIPO DE ARCHIVO
    // =========================================

    // Comprobamos que el archivo sea una imagen.
    // Por ejemplo: image/png, image/jpeg, etc.
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


    // =========================================
    // COMPROBAR TAMAÑO
    // =========================================

    // Limitamos las imágenes a un máximo de 5 MB.
    if (archivo.size > 5 * 1024 * 1024) {

      return new Response(
        JSON.stringify({
          ok: false,
          mensaje: "La imagen no puede superar los 5 MB.",
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
    // CONVERTIR IMAGEN A BASE64
    // =========================================

    // Convertimos el archivo recibido a un Buffer.
    const buffer = Buffer.from(
      await archivo.arrayBuffer()
    );

    // Convertimos la imagen a una cadena Base64.
    //
    // Se conserva el tipo MIME de la imagen
    // para poder utilizarla directamente como src
    // posteriormente.
    const imagenBase64 =
      `data:${archivo.type};base64,${buffer.toString("base64")}`;


    // =========================================
    // GUARDAR EN POSTGRESQL
    // =========================================

    // Actualizamos la foto del usuario actual.
    //
    // usuario.id identifica al usuario que inició sesión.
    await db.query(
      `UPDATE usuarios
       SET foto_perfil = $1
       WHERE id = $2`,
      [
        imagenBase64,
        usuario.id
      ]
    );


    // =========================================
    // RESPUESTA EXITOSA
    // =========================================

    // Devolvemos la imagen guardada al navegador
    // para que pueda mostrarse inmediatamente.
    return new Response(
      JSON.stringify({
        ok: true,
        foto: imagenBase64,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );


  } catch (error) {

    // Si ocurre un error inesperado,
    // lo mostramos en la consola del servidor.
    console.error(
      "Error al guardar foto de perfil:",
      error
    );


    // Enviamos un mensaje genérico al navegador.
    return new Response(
      JSON.stringify({
        ok: false,
        mensaje: "No se pudo guardar la foto.",
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