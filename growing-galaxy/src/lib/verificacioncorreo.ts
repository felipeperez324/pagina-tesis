
import {
  createHmac,
  createHash,
  randomInt,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

import nodemailer from "nodemailer";

// =========================================
// GENERAR CÓDIGO DE 6 DÍGITOS
// =========================================

export function generarCodigoCorreo(): string {
  return randomInt(0, 1_000_000)
    .toString()
    .padStart(6, "0");
}

// =========================================
// HASH DEL CÓDIGO
// =========================================

// Ahora vinculamos el código al correo,
// porque el usuario todavía no existe.
export function hashCodigoCorreo(
  correo: string,
  codigo: string
): string {
  const secreto = import.meta.env.EMAIL_CODE_SECRET;

  if (!secreto || secreto.length < 32) {
    throw new Error(
      "EMAIL_CODE_SECRET no está configurado correctamente."
    );
  }

  return createHmac("sha256", secreto)
    .update(`${correo.trim().toLowerCase()}:${codigo}`)
    .digest("hex");
}

export function comprobarCodigoCorreo(
  correo: string,
  codigo: string,
  hashGuardado: string
): boolean {
  if (!/^[a-f0-9]{64}$/.test(hashGuardado)) {
    return false;
  }

  const nuevoHash = hashCodigoCorreo(correo, codigo);

  return timingSafeEqual(
    Buffer.from(nuevoHash, "hex"),
    Buffer.from(hashGuardado, "hex")
  );
}

// =========================================
// COMPROBANTE DE VERIFICACIÓN
// =========================================

// Cuando el correo se verifica, generamos
// un comprobante aleatorio de un solo uso.
export function generarComprobante(): string {
  return randomBytes(32).toString("hex");
}

export function hashComprobante(
  comprobante: string
): string {
  return createHash("sha256")
    .update(comprobante)
    .digest("hex");
}

// =========================================
// ENVÍO REAL DEL CORREO
// =========================================

export async function enviarCodigoCorreo(
  destinatario: string,
  codigo: string
): Promise<void> {
  const usuarioSMTP = import.meta.env.SMTP_USER;
  const passwordSMTP = import.meta.env.SMTP_APP_PASSWORD;

  if (!usuarioSMTP || !passwordSMTP) {
    throw new Error(
      "Falta configurar SMTP_USER o SMTP_APP_PASSWORD."
    );
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: usuarioSMTP,
      pass: passwordSMTP
    }
  });

  await transporter.sendMail({
    from: `"KodApp" <${usuarioSMTP}>`,
    to: destinatario,
    subject: "KodApp - Verifica tu correo",

    text:
      `¡Bienvenido a KodApp!\n\n` +
      `Tu código de seguridad es: ${codigo}\n\n` +
      `El código vence en 10 minutos.\n` +
      `No lo compartas con nadie.`,

    html: `
      <div style="
        background:#1e2229;
        color:#f8f9fa;
        padding:35px;
        max-width:480px;
        margin:auto;
        border-radius:18px;
        font-family:Arial,sans-serif;
        text-align:center;
      ">
        <h1 style="color:#ff6b4a;">
          🐾 KodApp
        </h1>

        <h2>¡Verifica tu correo!</h2>

        <p>
          Introduce este código en tu
          formulario de registro.
        </p>

        <div style="
          margin:25px 0;
          padding:20px;
          background:#303640;
          border:1px solid #ff6b4a;
          border-radius:12px;
          font-size:36px;
          font-weight:bold;
          letter-spacing:8px;
          color:#4ebe96;
        ">
          ${codigo}
        </div>

        <p>Válido durante 10 minutos.</p>

        <p style="color:#aeb7c0;font-size:12px;">
          Si no solicitaste este código,
          puedes ignorar este correo.
        </p>
      </div>
    `
  });
}
