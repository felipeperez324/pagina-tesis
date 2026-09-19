import type { APIRoute } from "astro";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { db } from "../../lib/db";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const data = await request.json();

    const correo = data.correo?.trim().toLowerCase();
    const contrasena = data.contrasena;

    if (!correo || !contrasena) {
      return new Response(
        JSON.stringify({
          ok: false,
          mensaje: "Correo y contraseña son obligatorios.",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const resultado = await db.query(
      `SELECT
        id,
        nombre,
        correo,
        tipo_usuario,
        contrasena,
        estado_cuenta
      FROM usuarios
      WHERE correo = $1`,
      [correo]
    );

    if (resultado.rows.length === 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          mensaje: "Correo o contraseña incorrectos.",
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const usuario = resultado.rows[0];

    if (usuario.estado_cuenta !== "activo") {
      return new Response(
        JSON.stringify({
          ok: false,
          mensaje: "La cuenta está suspendida.",
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const contraseñaCorrecta = await bcrypt.compare(
      contrasena,
      usuario.contrasena
    );

    if (!contraseñaCorrecta) {
      return new Response(
        JSON.stringify({
          ok: false,
          mensaje: "Correo o contraseña incorrectos.",
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Crear una nueva sesión
    const sessionId = randomUUID();

    await db.query(
      `INSERT INTO sesiones (id, usuario_id)
       VALUES ($1, $2)`,
      [sessionId, usuario.id]
    );

    // Guardar la sesión en una cookie
    cookies.set("session_id", sessionId, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: "lax",
      path: "/",
    });

    return new Response(
      JSON.stringify({
        ok: true,
        usuario: {
          id: usuario.id,
          nombre: usuario.nombre,
          correo: usuario.correo,
          tipoUsuario: usuario.tipo_usuario,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error en login:", error);

    return new Response(
      JSON.stringify({
        ok: false,
        mensaje: "Error interno del servidor.",
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