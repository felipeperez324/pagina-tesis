
import type { Pool } from "pg";

const LIMITE_MINUTOS = 60;

export async function validarSesion(
  pool: Pool,
  sessionId: string | undefined
): Promise<number | null> {

  if (!sessionId) return null;

  const resultado = await pool.query(
    `UPDATE sesiones
     SET ultima_actividad = NOW()
     WHERE id = $1
       AND ultima_actividad >
         NOW() - ($2 * INTERVAL '1 minute')
     RETURNING usuario_id`,
    [sessionId, LIMITE_MINUTOS]
  );

  if (resultado.rowCount === 0) {
    // Si expiró, eliminar la sesión del servidor.
    await pool.query(
      `DELETE FROM sesiones
       WHERE id = $1
         AND ultima_actividad <=
           NOW() - ($2 * INTERVAL '1 minute')`,
      [sessionId, LIMITE_MINUTOS]
    );

    return null;
  }

  return Number(resultado.rows[0].usuario_id);
}
