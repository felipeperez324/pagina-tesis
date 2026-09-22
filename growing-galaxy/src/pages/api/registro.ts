// Importamos el tipo APIRoute de Astro
// para definir correctamente nuestro endpoint.
import type { APIRoute } from "astro";

// bcrypt se utiliza para encriptar las contraseñas.
// Nunca guardamos la contraseña original en la base de datos.
import bcrypt from "bcrypt";

// Importamos nuestra conexión con PostgreSQL.
import { db } from "../../lib/db";

// Indicamos que este endpoint se ejecuta en el servidor
// y no debe generarse como una página estática.
export const prerender = false;


// Endpoint que recibe las solicitudes POST del registro.
export const POST: APIRoute = async ({ request }) => {

  try {

    // Obtenemos los datos enviados desde el formulario.
    const data = await request.json();

    // Obtenemos y limpiamos el nombre.
    const nombre = data.nombre?.trim();

    // Obtenemos y limpiamos el RUT.
    const rut = data.rut?.trim();

    // Obtenemos el correo y lo convertimos a minúsculas.
    const correo = data.correo?.trim().toLowerCase();

    // Obtenemos el tipo de usuario seleccionado.
    const tipoUsuario = data.tipoUsuario;

    // Obtenemos la contraseña.
    const contrasena = data.contrasena;


    // Comprobamos que ningún campo obligatorio esté vacío.
    if (!nombre || !rut || !correo || !tipoUsuario || !contrasena) {

      // Respondemos con un error 400.
      return new Response(
        JSON.stringify({
          ok: false,
          mensaje: "Todos los campos son obligatorios.",
        }),
        {
          status: 400,
        }
      );
    }


    // Comprobamos si ya existe un usuario
    // utilizando el mismo correo o RUT.
    const usuarioExistente = await db.query(
      "SELECT id FROM usuarios WHERE correo = $1 OR rut = $2",
      [correo, rut]
    );


    // Si encontramos un usuario existente,
    // no permitimos crear otra cuenta con esos datos.
    if (usuarioExistente.rows.length > 0) {

      return new Response(
        JSON.stringify({
          ok: false,
          mensaje: "El correo o RUT ya están registrados.",
        }),
        {
          status: 409,
        }
      );
    }


    // Encriptamos la contraseña antes de guardarla.
    //
    // El número 12 corresponde al costo utilizado
    // por bcrypt para generar el hash.
    const hash = await bcrypt.hash(contrasena, 12);


    // Insertamos el nuevo usuario en PostgreSQL.
    //
    // Guardamos el hash y NO la contraseña original.
    await db.query(
      `INSERT INTO usuarios
      (nombre, rut, correo, tipo_usuario, contrasena)
      VALUES ($1, $2, $3, $4, $5)`,

      [
        nombre,
        rut,
        correo,
        tipoUsuario,
        hash
      ]
    );


    // Informamos que la cuenta fue creada correctamente.
    return new Response(
      JSON.stringify({
        ok: true,
        mensaje: "Cuenta creada correctamente.",
      }),
      {
        status: 201,
      }
    );


  } catch (error) {

    // Mostramos el error en la consola del servidor
    // para poder encontrar problemas durante el desarrollo.
    console.error(error);


    // Enviamos un mensaje genérico al navegador.
    return new Response(
      JSON.stringify({
        ok: false,
        mensaje: "Error al crear la cuenta.",
      }),
      {
        status: 500,
      }
    );
  }
};