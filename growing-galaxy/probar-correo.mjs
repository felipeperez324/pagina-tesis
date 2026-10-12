
import "dotenv/config";
import nodemailer from "nodemailer";

const usuario = process.env.SMTP_USER?.trim();

const contraseña =
  process.env.SMTP_APP_PASSWORD?.replace(/\s/g, "");

if (!usuario || !contraseña) {
  console.error("Faltan credenciales SMTP en .env");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: usuario,
    pass: contraseña
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000
});

try {
  console.log("Comprobando conexión con Gmail...");

  await transporter.verify();

  console.log("Autenticación SMTP correcta.");

  await transporter.sendMail({
    from: usuario,
    to: usuario,
    subject: "Prueba de correo - KodApp",
    text: "¡El sistema de correos de KodApp funciona!"
  });

  console.log("Gmail aceptó el correo de prueba.");

} catch (error) {
  console.error("Código del error:", error.code);
  console.error("Respuesta SMTP:", error.responseCode);
  console.error("Detalle:", error.message);
  process.exitCode = 1;
}
