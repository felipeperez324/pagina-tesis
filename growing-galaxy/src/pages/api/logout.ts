// Importamos el tipo de endpoint de Astro.
import type { APIRoute } from "astro";

// Importamos la conexión con PostgreSQL.
import { db } from "../../lib/db";

// Indicamos que este endpoint funciona en el servidor.
export const prerender = false;


// Endpoint POST encargado de cerrar la sesión.
export const POST: APIRoute = async ({ cookies }) => {

  try {

    // Obtenemos el ID de sesión desde la cookie.
    const sessionId = cookies.get("session_id")?.value;


    // Si existe una sesión, la eliminamos de PostgreSQL.
    if (sessionId) {

      await db.query(
        `DELETE FROM sesiones
         WHERE id = $1`,

        [sessionId]
      );
    }


    // Eliminamos también la cookie del navegador.
    cookies.delete("session_id", {
      path: "/",
    });


    // Respondemos indicando que el cierre fue exitoso.
    return new Response(
      JSON.stringify({
        ok: true,
        mensaje: "Sesión cerrada correctamente.",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );


  } catch (error) {

    // Mostramos el error en la consola.
    console.error("Error al cerrar sesión:", error);


    // Informamos al navegador que ocurrió un problema.
    return new Response(
      JSON.stringify({
        ok: false,
        mensaje: "No se pudo cerrar la sesión.",
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