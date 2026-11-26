
import {
  validarRut,
  formatearRut
} from "./rut";

import {
  validarContrasena
} from "./validarcontrasena";

// ==========================================
// KODAAPP - SERIALIZER DE USUARIOS
// ==========================================

export interface EntradaRegistro {
  nombre: string;
  rut: string;
  rutCompacto: string;
  correo: string;
  tipoUsuario: "adoptante" | "organizacion";
  contrasena: string;
  comprobante: string;
}

type ResultadoRegistro =
  | { ok: true; datos: EntradaRegistro }
  | {
      ok: false;
      mensaje: string;
      estado: 400 | 403;
    };

// ==========================================
// VALIDACIÓN Y NORMALIZACIÓN
// ==========================================

export function leerRegistro(
  cuerpo: unknown
): ResultadoRegistro {

  const error = (
    mensaje: string,
    estado: 400 | 403 = 400
  ) => ({
    ok: false as const,
    mensaje,
    estado
  });

  // Validar estructura de entrada.

  if (
    !cuerpo ||
    typeof cuerpo !== "object" ||
    Array.isArray(cuerpo)
  ) {
    return error("Solicitud inválida.");
  }

  const datos = cuerpo as Record<string, unknown>;

  // ========================================
  // NORMALIZAR CAMPOS
  // ========================================

  const texto = (campo: string) =>
    typeof datos[campo] === "string"
      ? (datos[campo] as string).trim()
      : "";

  const nombre = texto("nombre");
  const rutEntrada = texto("rut");

  const correo = texto("correo").toLowerCase();

  const tipoUsuario = datos.tipoUsuario;
  const contrasena = datos.contrasena;
  const comprobante = datos.comprobante;

  // ========================================
  // CAMPOS OBLIGATORIOS
  // ========================================

  if (
    !nombre ||
    !rutEntrada ||
    !correo ||
    typeof contrasena !== "string" ||
    !contrasena
  ) {
    return error("Completa todos los campos.");
  }

  // ========================================
  // VALIDAR NOMBRE
  // ========================================

  if (nombre.length > 100) {
    return error(
      "El nombre no puede superar 100 caracteres."
    );
  }

  // ========================================
  // VALIDAR RUT CHILENO
  // ========================================

  if (!validarRut(rutEntrada)) {
    return error(
      "El RUT ingresado no tiene un dígito " +
      "verificador válido. Revisa los datos."
    );
  }

  const rut = formatearRut(rutEntrada);

  if (rut.length > 12) {
    return error(
      "El formato del RUT es inválido."
    );
  }

  // Formato utilizado para buscar duplicados.

  const rutCompacto = rut
    .toUpperCase()
    .replace(/[^0-9K]/g, "");

  // ========================================
  // VALIDAR CORREO ELECTRÓNICO
  // ========================================

  if (
    correo.length > 150 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)
  ) {
    return error("Correo electrónico inválido.");
  }

  // ========================================
  // VALIDAR CONTRASEÑA
  // ========================================

  if (
    contrasena.length > 72 ||
    Buffer.byteLength(contrasena, "utf8") > 72
  ) {
    return error(
      "La contraseña es demasiado larga."
    );
  }

  const errores = validarContrasena(contrasena);

  if (errores.length > 0) {
    return error(errores.join(" "));
  }

  // ========================================
  // VALIDAR TIPO DE USUARIO
  // ========================================

  if (
    tipoUsuario !== "adoptante" &&
    tipoUsuario !== "organizacion"
  ) {
    return error(
      "Selecciona un tipo de cuenta válido."
    );
  }

  // ========================================
  // VALIDAR FORMATO DEL COMPROBANTE
  // ========================================

  if (
    typeof comprobante !== "string" ||
    !/^[a-f0-9]{64}$/.test(comprobante)
  ) {
    return error(
      "Primero debes verificar tu correo.",
      403
    );
  }

  // ========================================
  // DEVOLVER ÚNICAMENTE CAMPOS AUTORIZADOS
  // ========================================

  return {
    ok: true,

    datos: {
      nombre,
      rut,
      rutCompacto,
      correo,
      tipoUsuario,
      contrasena,
      comprobante
    }
  };

}
