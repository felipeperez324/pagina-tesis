
/**
 * KODAPP - VALIDACIÓN DE CONTRASEÑAS
 *
 * Reglas:
 * - Mínimo 8 caracteres.
 * - Una mayúscula.
 * - Una minúscula.
 * - Un número.
 * - Un símbolo especial.
 * - Bloquear contraseñas comunes.
 */

export function validarContrasena(
  contrasena: unknown
): string[] {

  const errores: string[] = [];

  // Validar que sea texto.
  if (typeof contrasena !== "string") {
    return ["Debes ingresar una contraseña válida."];
  }

  // Mínimo 8 caracteres.
  if (contrasena.length < 8) {
    errores.push("Debe tener al menos 8 caracteres.");
  }

  // Mayúscula.
  if (!/[A-Z]/.test(contrasena)) {
    errores.push("Debe contener una mayúscula.");
  }

  // Minúscula.
  if (!/[a-z]/.test(contrasena)) {
    errores.push("Debe contener una minúscula.");
  }

  // Número.
  if (!/[0-9]/.test(contrasena)) {
    errores.push("Debe contener un número.");
  }

  // Símbolo.
  if (!/[^A-Za-z0-9\s]/.test(contrasena)) {
    errores.push("Debe contener un símbolo.");
  }

  // No permitir espacios.
  if (/\s/.test(contrasena)) {
    errores.push("No se permiten espacios.");
  }

  // Límite de bcrypt.
  if (Buffer.byteLength(contrasena, "utf8") > 72) {
    errores.push("La contraseña es demasiado larga.");
  }

  // Normalizar sustituciones comunes.
  const normalizada = contrasena
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/0/g, "o")
    .replace(/[1!]/g, "i")
    .replace(/3/g, "e")
    .replace(/[5$]/g, "s")
    .replace(/[^a-z0-9]/g, "");

  const comunes = [
    "password",
    "contrasena",
    "123456",
    "qwerty",
    "admin",
    "welcome",
    "abcdef"
  ];

  if (
    comunes.some(
      palabra => normalizada.includes(palabra)
    )
  ) {
    errores.push("La contraseña es demasiado común.");
  }

  return errores;
}
