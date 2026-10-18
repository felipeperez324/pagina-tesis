
import { db } from "./db";
import { dbFotos } from "./dbfotos";
import { validarSesion } from "./seguridad/sesiones";

/**
 * KODAPP - AUTENTICACIÓN CENTRAL
 *
 * Devuelve los datos del usuario asociado
 * a una sesión vigente.
 *
 * Nunca devuelve el hash de la contraseña.
 */

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
  // 1. Comprobar que la sesión no haya vencido.
  const usuarioId = await validarSesion(sessionId);

  if (!usuarioId) {
    return null;
  }

  // 2. Recuperar usuario de la base principal.
  const resultado = await db.query(
    `SELECT id,
            nombre,
            correo,
            rut,
            tipo_usuario,
            estado_cuenta,
            descripcion_perfil
     FROM usuarios
     WHERE id = $1
       AND estado_cuenta = 'activo'`,
    [usuarioId]
  );

  if (resultado.rows.length === 0) {
    return null;
  }

  const usuario = resultado.rows[0];
  let fotoPerfil: string | null = null;

  // 3. Buscar fotografía en KodApp_Fotos.
  try {
    const fotos = await dbFotos.query(
      `SELECT imagen, tipo_mime
       FROM fotos_perfil
       WHERE usuario_id = $1`,
      [usuarioId]
    );

    if (fotos.rows.length > 0) {
      const foto = fotos.rows[0];

      // PostgreSQL BYTEA normalmente llega como Buffer.
      const buffer = Buffer.isBuffer(foto.imagen)
        ? foto.imagen
        : Buffer.from(foto.imagen);

      // La imagen se puede mostrar directamente en <img>.
      fotoPerfil =
        `data:${foto.tipo_mime};base64,${buffer.toString("base64")}`;
    }
  } catch (error) {
    // Una falla en fotografías no debe impedir
    // que el usuario utilice el resto de KodApp.
    console.error("Error cargando fotografía de perfil:", error);
  }

  // 4. Entregar solamente los datos necesarios.
  return {
    id: Number(usuario.id),
    nombre: usuario.nombre,
    correo: usuario.correo,
    rut: usuario.rut,
    tipo_usuario: usuario.tipo_usuario,
    estado_cuenta: usuario.estado_cuenta,
    descripcion_perfil: usuario.descripcion_perfil,
    foto_perfil: fotoPerfil
  };
}
