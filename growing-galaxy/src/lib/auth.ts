
import { db } from "./db";
import { obtenerFotoPerfil } from "./fotos";

export interface UsuarioSesion {
  id: number;
  nombre: string;
  rut: string;
  correo: string;
  tipo_usuario: "adoptante" | "organizacion";
  estado_cuenta: string;
  descripcion_perfil: string;
  foto_perfil: string | null;
}

export async function getUsuarioDesdeSesion(
  sessionId: string | undefined
): Promise<UsuarioSesion | null> {
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
       u.descripcion_perfil
     FROM sesiones AS s
     INNER JOIN usuarios AS u
       ON u.id = s.usuario_id
     WHERE s.id = $1
       AND u.estado_cuenta = 'activo'
     LIMIT 1`,
    [sessionId]
  );

  if (resultado.rows.length === 0) {
    return null;
  }

  const usuario = resultado.rows[0];

  const foto = await obtenerFotoPerfil(Number(usuario.id));

  return {
    id: Number(usuario.id),
    nombre: usuario.nombre,
    rut: usuario.rut,
    correo: usuario.correo,
    tipo_usuario: usuario.tipo_usuario,
    estado_cuenta: usuario.estado_cuenta,
    descripcion_perfil: usuario.descripcion_perfil ?? "",
    foto_perfil: foto
  };
}
