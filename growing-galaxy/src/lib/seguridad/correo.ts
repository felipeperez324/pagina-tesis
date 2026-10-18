
import {
  createHmac,
  randomInt,
  timingSafeEqual
} from "node:crypto";

import nodemailer from "nodemailer";

/**
 * KODAPP - VERIFICACIÓN DE NUEVO CORREO
 *
 * Utiliza las variables SMTP que ya tiene KodApp.
 * Nunca guarda el código en texto plano.
 */

// Crear código de seis números.
export function generarCodigo(): string {
  return randomInt(0, 1000000)
    .toString()
    .padStart(6, "0");
}

// Secreto privado para calcular el hash del código.
function obtenerSecreto(): string {
  const secreto = import.meta.env.EMAIL_CODE_SECRET;

  if (!secreto || secreto.length < 32) {
    throw new Error(
      "EMAIL_CODE_SECRET no está configurado correctamente."
    );
  }

  return secreto;
}

// Asociar el código al usuario y al correo solicitado.
export function hashCodigo(
  usuarioId: number,
  correo: string,
  codigo: string
): string {
  return createHmac("sha256", obtenerSecreto())
    .update(`${usuarioId}:${correo}:${codigo}`)
    .digest("hex");
}

// Comparar hashes sin filtraciones de tiempo simples.
export function compararCodigos(
  esperado: string,
  recibido: string
): boolean {
  if (
    !/^[a-f0-9]{64}$/i.test(esperado) ||
    !/^[a-f0-9]{64}$/i.test(recibido)
  ) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(esperado, "hex"),
    Buffer.from(recibido, "hex")
  );
}

// Enviar correo mediante SMTP.
export async function enviarCodigo(
  destinatario: string,
  codigo: string
): Promise<void> {
  const puerto = Number(import.meta.env.SMTP_PORT || 465);

  const transportador = nodemailer.createTransport({
    host: import.meta.env.SMTP_HOST || "smtp.gmail.com",
    port: puerto,
    secure: puerto === 465,
    auth: {
      user: import.meta.env.SMTP_USER,
      pass: import.meta.env.SMTP_APP_PASSWORD
    }
  });

  await transportador.sendMail({
    from: import.meta.env.SMTP_USER,
    to: destinatario,
    subject: "KodApp - Cambiar correo electrónico",
    text: `Tu código de verificación es: ${codigo}

El código vence en 15 minutos.

Si no solicitaste este cambio, ignora el mensaje.`
  });
}
