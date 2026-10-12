import { dbFotos } from "./dbfotos";
// Obtiene la foto de perfil de un usuario.
export async function obtenerFotoPerfil(
  usuarioId: number
): Promise<string | null> {
  const resultado = await dbFotos.query(
    `SELECT imagen, tipo_mime
     FROM fotos_perfil
     WHERE usuario_id = $1`,
    [usuarioId]
  );

  const foto = resultado.rows[0];

  if (!foto) return null;

  return `data:${foto.tipo_mime};base64,${foto.imagen.toString("base64")}`;
}

// Añade las fotos a una lista de mascotas.
// Los datos de la mascota vienen de KodApp;
// sus imágenes vienen de KodApp_Fotos.
export async function agregarFotosMascotas<
  T extends { id: number }
>(
  mascotas: T[]
): Promise<Array<T & { foto: string | null }>> {
  if (mascotas.length === 0) return [];

  const ids = mascotas.map((m) => m.id);

  const resultado = await dbFotos.query(
    `SELECT mascota_id, imagen, tipo_mime
     FROM fotos_mascotas
     WHERE mascota_id = ANY($1::integer[])`,
    [ids]
  );

  const fotos = new Map<number, string>();

  for (const fila of resultado.rows) {
    fotos.set(
      Number(fila.mascota_id),
      `data:${fila.tipo_mime};base64,${fila.imagen.toString("base64")}`
    );
  }

  return mascotas.map((mascota) => ({
    ...mascota,
    foto: fotos.get(Number(mascota.id)) ?? null,
  }));
}