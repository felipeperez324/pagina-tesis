import { db } from "./db";

export async function getUsuarioDesdeSesion(
  sessionId: string | undefined
) {
  if (!sessionId) {
    return null;
  }

  const resultado = await db.query(
    `SELECT
      u.id,
      u.nombre,
      u.rut,
      u.correo,
      u.tipo_usuario,
      u.estado_cuenta,
      u.foto_perfil
    FROM sesiones s
    INNER JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.id = $1
      AND u.estado_cuenta = 'activo'`,
    [sessionId]
  );

  if (resultado.rows.length === 0) {
    return null;
  }

  return resultado.rows[0];
}