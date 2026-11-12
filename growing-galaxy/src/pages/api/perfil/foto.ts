
import type { APIRoute } from "astro";

import { db } from "../../../lib/db";

import {
  getUsuarioDesdeSesion
} from "../../../lib/auth";

import {
  validarImagen,
  subirImagen,
  borrarImagen,
  ErrorImagen
} from "../../../lib/azure";

import { urlFotoPerfil } from "../../../lib/fotos";

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

export const POST: APIRoute = async ({
  request,
  cookies
}) => {
  const origin = request.headers.get("origin");

  if (
    origin &&
    origin !== new URL(request.url).origin
  ) {
    return responder({
      ok: false,
      mensaje: "Origen no permitido."
    }, 403);
  }

  try {
    const usuario = await getUsuarioDesdeSesion(
      cookies.get("session_id")?.value
    );

    if (!usuario) {
      return responder({
        ok: false,
        mensaje: "Debes iniciar sesión."
      }, 401);
    }

    const formulario = await request.formData();

    const imagen = await validarImagen(
      formulario.get("foto")
    );

    if (!imagen) {
      return responder({
        ok: false,
        mensaje: "Selecciona una imagen."
      }, 400);
    }

    // Consultar la fotografía anterior.
    const anterior = await db.query(
      "SELECT foto_blob FROM usuarios WHERE id = $1",
      [usuario.id]
    );

    if (!anterior.rows.length) {
      return responder({
        ok: false,
        mensaje: "Usuario no encontrado."
      }, 404);
    }

    // Subir nueva fotografía a Azure.
    const nombre = await subirImagen(
      "perfiles",
      usuario.id,
      imagen
    );

    try {
      // Guardar únicamente la referencia.
      await db.query(
        `UPDATE usuarios
         SET foto_blob = $1
         WHERE id = $2`,
        [nombre, usuario.id]
      );
    } catch (error) {
      await borrarImagen(nombre).catch(console.error);
      throw error;
    }

    // Limpiar la fotografía reemplazada.
    const antigua =
      anterior.rows[0].foto_blob as string | null;

    if (antigua) {
      await borrarImagen(antigua).catch(error =>
        console.error(
          "Fallo limpiando avatar anterior:",
          error
        )
      );
    }

    return responder({
      ok: true,
      foto: urlFotoPerfil(usuario.id, nombre)
    });

  } catch (error) {
    if (error instanceof ErrorImagen) {
      return responder({
        ok: false,
        mensaje: error.message
      }, 400);
    }

    console.error(
      "Error guardando avatar en Azure:",
      error
    );

    return responder({
      ok: false,
      mensaje: "No se pudo guardar la fotografía."
    }, 500);
  }
};
