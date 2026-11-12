
import {
  BlobServiceClient,
  type ContainerClient
} from "@azure/storage-blob";

import { randomUUID } from "node:crypto";

type TipoImagen =
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export type ImagenValidada = {
  datos: Buffer;
  mime: TipoImagen;
  extension: string;
};

export class ErrorImagen extends Error {}

let contenedorPendiente:
  Promise<ContainerClient> | undefined;

async function obtenerContenedor(): Promise<ContainerClient> {
  if (!contenedorPendiente) {
    contenedorPendiente = (async () => {
      const conexion =
        import.meta.env.AZURE_STORAGE_CONNECTION_STRING;

      const nombre =
        import.meta.env.AZURE_STORAGE_CONTAINER ||
        "kodapp-fotos";

      if (!conexion) {
        throw new Error(
          "Falta AZURE_STORAGE_CONNECTION_STRING en .env"
        );
      }

      const contenedor =
        BlobServiceClient.fromConnectionString(conexion)
          .getContainerClient(nombre);

      // El contenedor se crea sin acceso público.
      await contenedor.createIfNotExists();

      return contenedor;
    })().catch((error) => {
      contenedorPendiente = undefined;
      throw error;
    });
  }

  return contenedorPendiente;
}

export async function validarImagen(
  valor: FormDataEntryValue | null,
  opcional = false
): Promise<ImagenValidada | null> {
  if (
    valor === null ||
    (valor instanceof File && valor.size === 0)
  ) {
    if (opcional) return null;
    throw new ErrorImagen("Selecciona una fotografía.");
  }

  if (!(valor instanceof File)) {
    throw new ErrorImagen("El archivo no es válido.");
  }

  if (valor.size > 5 * 1024 * 1024) {
    throw new ErrorImagen(
      "La imagen no puede superar los 5 MB."
    );
  }

  if (
    !["image/jpeg", "image/png", "image/webp"]
      .includes(valor.type)
  ) {
    throw new ErrorImagen(
      "Solo se permiten imágenes JPG, PNG o WebP."
    );
  }

  const datos = Buffer.from(await valor.arrayBuffer());

  const esJpg =
    datos.length >= 3 &&
    datos[0] === 0xff &&
    datos[1] === 0xd8 &&
    datos[2] === 0xff;

  const esPng =
    datos.length >= 8 &&
    datos.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );

  const esWebp =
    datos.length >= 12 &&
    datos.toString("ascii", 0, 4) === "RIFF" &&
    datos.toString("ascii", 8, 12) === "WEBP";

  if (
    !(
      (valor.type === "image/jpeg" && esJpg) ||
      (valor.type === "image/png" && esPng) ||
      (valor.type === "image/webp" && esWebp)
    )
  ) {
    throw new ErrorImagen(
      "El contenido no corresponde a una imagen válida."
    );
  }

  const extension =
    valor.type === "image/jpeg"
      ? "jpg"
      : valor.type === "image/png"
        ? "png"
        : "webp";

  return {
    datos,
    mime: valor.type as TipoImagen,
    extension
  };
}

export async function subirImagen(
  carpeta: "mascotas" | "perfiles",
  id: number,
  imagen: ImagenValidada
): Promise<string> {
  const nombre =
    `${carpeta}/${id}/${randomUUID()}.${imagen.extension}`;

  const contenedor = await obtenerContenedor();

  await contenedor
    .getBlockBlobClient(nombre)
    .uploadData(imagen.datos, {
      blobHTTPHeaders: {
        blobContentType: imagen.mime
      }
    });

  return nombre;
}

export async function borrarImagen(
  nombre: string | null
): Promise<void> {
  if (!nombre) return;

  const contenedor = await obtenerContenedor();

  try {
    await contenedor.deleteBlob(nombre, {
      deleteSnapshots: "include"
    });
  } catch (error) {
    if (
      (error as { statusCode?: number }).statusCode !== 404
    ) {
      throw error;
    }
  }
}

export async function descargarImagen(
  nombre: string
): Promise<{
  datos: Buffer;
  mime: string;
}> {
  const contenedor = await obtenerContenedor();

  const datos = await contenedor
    .getBlockBlobClient(nombre)
    .downloadToBuffer();

  const extension =
    nombre.split(".").pop()?.toLowerCase();

  const mime =
    extension === "jpg"
      ? "image/jpeg"
      : extension === "png"
        ? "image/png"
        : "image/webp";

  return { datos, mime };
}
