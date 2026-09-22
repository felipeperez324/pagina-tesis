// Importamos el tipo de endpoint de Astro.
import type { APIRoute } from "astro";

// bcrypt permite comparar la contraseña ingresada
// con el hash almacenado en PostgreSQL.
import bcrypt from "bcrypt";

// randomUUID genera un identificador único
// para cada sesión.
import { randomUUID } from "crypto";

// Importamos nuestra conexión con PostgreSQL.
import { db } from "../../lib/db";

// Este endpoint se ejecuta en el servidor.
export const prerender = false;


// Endpoint POST utilizado para iniciar sesión.
export const POST: APIRoute = async ({ request, cookies }) => {

  try {

    // Recibimos los datos enviados desde el formulario.
    const data = await request.json();

    // Obtenemos el correo y lo normalizamos.
    const correo = data.correo?.trim().toLowerCase();

    // Obtenemos la contraseña.
    const contrasena = data.contrasena;


    // Comprobamos que ambos campos estén completos.
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


    // Buscamos al usuario utilizando su correo.
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


    // Si no existe un usuario con ese correo,
    // rechazamos el inicio de sesión.
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


    // Guardamos los datos del usuario encontrado.
    const usuario = resultado.rows[0];


    // Comprobamos que la cuenta esté activa.
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


    // Comparamos la contraseña ingresada
    // con el hash guardado en PostgreSQL.
    const contraseñaCorrecta = await bcrypt.compare(
      contrasena,
      usuario.contrasena
    );


    // Si la contraseña no coincide,
    // rechazamos el inicio de sesión.
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


    // Generamos un ID único para la nueva sesión.
    const sessionId = randomUUID();


    // Guardamos la sesión en la tabla sesiones.
    //
    // Importante:
    // la tabla actual solamente utiliza id y usuario_id.
    await db.query(
      `INSERT INTO sesiones (id, usuario_id)
       VALUES ($1, $2)`,

      [
        sessionId,
        usuario.id
      ]
    );


    // Guardamos el ID de sesión en una cookie.
    //
    // httpOnly evita que JavaScript del navegador
    // pueda leer directamente la cookie.
    cookies.set("session_id", sessionId, {
      httpOnly: true,

      // En producción se utiliza HTTPS.
      secure: import.meta.env.PROD,

      // Protege la cookie frente a ciertos tipos
      // de solicitudes externas.
      sameSite: "lax",

      // La cookie estará disponible en todo el sitio.
      path: "/",
    });


    // Informamos al frontend que el login fue exitoso.
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

    // Mostramos el error real en la consola del servidor.
    console.error("Error en login:", error);


    // Enviamos un mensaje genérico al usuario.
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