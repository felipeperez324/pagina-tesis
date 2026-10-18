
/**
 * KODAPP - POLÍTICA DE CONTRASEÑAS
 *
 * Exigimos:
 * - 8 caracteres como mínimo.
 * - Al menos una mayúscula.
 * - Al menos una minúscula.
 * - Al menos un número.
 * - Al menos un símbolo.
 * - No utilizar contraseñas comunes.
 *
 * Esta función se utiliza en el servidor,
 * tanto para registro como para cambiar contraseña.
 */

export function validarContrasena(valor: unknown): string[] {
  const errores: string[] = [];

  if (typeof valor !== "string") {
    return ["Debes introducir una contraseña válida."];
  }

  if (valor.length < 8) {
    errores.push("La contraseña debe tener mínimo 8 caracteres.");
  }

  if (!/[A-Z]/.test(valor)) {
    errores.push("Debe contener una letra mayúscula.");
  }

  if (!/[a-z]/.test(valor)) {
    errores.push("Debe contener una letra minúscula.");
  }

  if (!/[0-9]/.test(valor)) {
    errores.push("Debe contener un número.");
  }

  if (!/[^A-Za-z0-9\s]/.test(valor)) {
    errores.push("Debe contener un símbolo.");
  }

  if (/\s/.test(valor)) {
    errores.push("No se permiten espacios.");
  }

  // bcrypt solo considera los primeros 72 bytes.
  if (Buffer.byteLength(valor, "utf8") > 72) {
    errores.push("La contraseña es demasiado larga.");
  }

  // Normalización para reconocer algunas sustituciones.
  const normalizada = valor
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
    "qwerty",
    "123456",
    "abcdef",
    "admin",
    "welcome"
  ];

  if (comunes.some(palabra => normalizada.includes(palabra))) {
    errores.push("La contraseña es demasiado común.");
  }

  return errores;
}
