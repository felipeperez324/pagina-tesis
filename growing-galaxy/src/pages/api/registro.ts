import type { APIRoute } from "astro";
import bcrypt from "bcrypt";
import { db } from "../../lib/db";
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();

    const nombre = data.nombre?.trim();
    const rut = data.rut?.trim();
    const correo = data.correo?.trim().toLowerCase();
    const tipoUsuario = data.tipoUsuario;
    const contrasena = data.contrasena;

    if (!nombre || !rut || !correo || !tipoUsuario || !contrasena) {
      return new Response(
        JSON.stringify({
          ok: false,
          mensaje: "Todos los campos son obligatorios.",
        }),
        { status: 400 }
      );
    }

    const usuarioExistente = await db.query(
      "SELECT id FROM usuarios WHERE correo = $1 OR rut = $2",
      [correo, rut]
    );

    if (usuarioExistente.rows.length > 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          mensaje: "El correo o RUT ya están registrados.",
        }),
        { status: 409 }
      );
    }

    const hash = await bcrypt.hash(contrasena, 12);

    await db.query(
      `INSERT INTO usuarios
      (nombre, rut, correo, tipo_usuario, contrasena)
      VALUES ($1, $2, $3, $4, $5)`,
      [nombre, rut, correo, tipoUsuario, hash]
    );

    return new Response(
      JSON.stringify({
        ok: true,
        mensaje: "Cuenta creada correctamente.",
      }),
      { status: 201 }
    );
  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        ok: false,
        mensaje: "Error al crear la cuenta.",
      }),
      { status: 500 }
    );
  }
};