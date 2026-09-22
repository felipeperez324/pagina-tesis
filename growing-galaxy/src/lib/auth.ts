// Importamos la conexión con PostgreSQL.
import { db } from "./db";

// Esta función recibe el ID de sesión guardado en la cookie
// y busca qué usuario corresponde a esa sesión.
export async function getUsuarioDesdeSesion(
  sessionId: string | undefined
) {

  // Si no existe un ID de sesión,
// significa que el usuario no está autenticado.
  if (!sessionId) {
    return null;
  }

  // Buscamos el usuario relacionado con la sesión.
  //
  // La tabla sesiones contiene el usuario_id.
  // Luego hacemos INNER JOIN con usuarios para obtener
  // todos los datos del usuario.
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

    // $1 representa el ID de sesión.
    [sessionId]
  );

  // Si no encontramos ninguna sesión válida,
// devolvemos null.
  if (resultado.rows.length === 0) {
    return null;
  }

  // Devolvemos los datos del usuario encontrado.
  return resultado.rows[0];
}