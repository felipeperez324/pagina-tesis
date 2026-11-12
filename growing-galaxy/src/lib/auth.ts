
import { db } from "./db";
import { urlFotoPerfil } from "./fotos";
import { validarSesion } from "./seguridad/sesiones";

export interface UsuarioAutenticado {
  id: number;
  nombre: string;
  correo: string;
  rut: string;
  tipo_usuario: "adoptante" | "organizacion";
  estado_cuenta: string;
  descripcion_perfil: string | null;
  foto_perfil: string | null;
}

export async function getUsuarioDesdeSesion(
  sessionId: string | undefined
): Promise<UsuarioAutenticado | null> {
  const usuarioId = await validarSesion(sessionId);

  if (!usuarioId) return null;

  const resultado = await db.query(
    `SELECT
       id,
       nombre,
       correo,
       rut,
       tipo_usuario,
       estado_cuenta,
       descripcion_perfil,
       foto_blob
     FROM usuarios
     WHERE id = $1
       AND estado_cuenta = 'activo'`,
    [usuarioId]
  );

  const usuario = resultado.rows[0];

  if (!usuario) return null;

  return {
    id: Number(usuario.id),
    nombre: usuario.nombre,
    correo: usuario.correo,
    rut: usuario.rut,
    tipo_usuario: usuario.tipo_usuario,
    estado_cuenta: usuario.estado_cuenta,
    descripcion_perfil: usuario.descripcion_perfil,
    foto_perfil: urlFotoPerfil(
      Number(usuario.id),
      usuario.foto_blob
    )
  };
}
