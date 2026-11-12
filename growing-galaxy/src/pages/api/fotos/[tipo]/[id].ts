
import type { APIRoute } from "astro";

import { db } from "../../../../lib/db";
import { getUsuarioDesdeSesion } from "../../../../lib/auth";
import { descargarImagen } from "../../../../lib/azure";

export const prerender = false;

export const GET: APIRoute = async ({
  params,
  cookies
}) => {
  const id = Number(params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return new Response(null, { status: 404 });
  }

  try {
    let nombre: string | null = null;

    // FOTOGRAFÍA DE PERFIL
    if (params.tipo === "perfil") {
      const usuario = await getUsuarioDesdeSesion(
        cookies.get("session_id")?.value
      );

      if (!usuario) {
        return new Response(null, { status: 401 });
      }

      if (usuario.id !== id) {
        return new Response(null, { status: 403 });
      }

      const resultado = await db.query(
        "SELECT foto_blob FROM usuarios WHERE id = $1",
        [id]
      );

      nombre = resultado.rows[0]?.foto_blob ?? null;

    // FOTOGRAFÍA DE MASCOTA
    } else if (params.tipo === "mascotas") {
      const resultado = await db.query(
        "SELECT foto_blob FROM mascotas WHERE id = $1",
        [id]
      );

      nombre = resultado.rows[0]?.foto_blob ?? null;
    } else {
      return new Response(null, { status: 404 });
    }

    if (!nombre) {
      return new Response(null, { status: 404 });
    }

    const { datos, mime } =
      await descargarImagen(nombre);

    return new Response(new Uint8Array(datos), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control":
          params.tipo === "perfil"
            ? "private, no-store"
            : "private, max-age=3600",
        "X-Content-Type-Options": "nosniff"
      }
    });

  } catch (error) {
    console.error(
      "Error consultando foto en Azure:",
      error
    );

    return new Response(null, { status: 500 });
  }
};
