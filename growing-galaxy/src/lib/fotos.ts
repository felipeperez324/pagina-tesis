
import { db } from "./db";

export function urlFotoPerfil(
  id: number,
  nombre: string | null
): string | null {
  return nombre
    ? `/api/fotos/perfil/${id}?v=${encodeURIComponent(nombre)}`
    : null;
}

export function urlFotoMascota(
  id: number,
  nombre: string | null
): string | null {
  return nombre
    ? `/api/fotos/mascotas/${id}?v=${encodeURIComponent(nombre)}`
    : null;
}

export async function obtenerFotoPerfil(
  usuarioId: number
): Promise<string | null> {
  const resultado = await db.query(
    "SELECT foto_blob FROM usuarios WHERE id = $1",
    [usuarioId]
  );

  return urlFotoPerfil(
    usuarioId,
    resultado.rows[0]?.foto_blob ?? null
  );
}

export async function agregarFotosMascotas<
  T extends { id: number }
>(
  mascotas: T[]
): Promise<Array<T & { foto: string | null }>> {
  if (!mascotas.length) return [];

  const resultado = await db.query(
    `SELECT id, foto_blob
     FROM mascotas
     WHERE id = ANY($1::integer[])`,
    [mascotas.map(m => Number(m.id))]
  );

  const fotos = new Map<number, string | null>();

  for (const fila of resultado.rows) {
    fotos.set(
      Number(fila.id),
      urlFotoMascota(Number(fila.id), fila.foto_blob)
    );
  }

  return mascotas.map(mascota => ({
    ...mascota,
    foto: fotos.get(Number(mascota.id)) ?? null
  }));
}
