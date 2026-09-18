import type { APIRoute } from "astro";
import { db } from "../../lib/db";

export const GET: APIRoute = async () => {
  try {
    const result = await db.query("SELECT NOW()");

    return new Response(
      JSON.stringify({
        conectado: true,
        fecha: result.rows[0].now,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        conectado: false,
        error: String(error),
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