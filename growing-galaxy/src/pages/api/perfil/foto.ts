import type { APIRoute } from "astro";
import { db } from "../../../lib/db";
import { getUsuarioDesdeSesion } from "../../../lib/auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // Comprobar sesión
    const sessionId = cookies.get("session_id")?.value;

    const usuario = await getUsuarioDesdeSesion(sessionId);

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

    // Obtener archivo enviado
    const formData = await request.formData();

    const archivo = formData.get("foto");

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

    // Comprobar que sea una imagen
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

    // Máximo 5 MB
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

    // Convertir imagen a Base64
    const buffer = Buffer.from(await archivo.arrayBuffer());

    const imagenBase64 =
      `data:${archivo.type};base64,${buffer.toString("base64")}`;

    // Guardar en PostgreSQL
    await db.query(
      `UPDATE usuarios
       SET foto_perfil = $1
       WHERE id = $2`,
      [imagenBase64, usuario.id]
    );

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
    console.error("Error al guardar foto de perfil:", error);

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