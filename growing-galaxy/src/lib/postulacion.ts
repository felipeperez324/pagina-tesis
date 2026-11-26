
// =============================================
// KODAAPP - SERIALIZER DE POSTULACIONES
// =============================================

// Estructura de datos permitida para la entrada.
export interface EntradaPostulacion {
  mascotaId: number;
  telefono: string;
  vivienda: "casa" | "departamento" | "otro";
  motivo: string;
}

// Estructura de datos permitida para la respuesta.
export interface RespuestaPostulacion {
  ok: boolean;
  mensaje: string;
}

// =============================================
// SERIALIZER DE ENTRADA
// Validación y normalización de datos.
// =============================================

export function leerPostulacion(
  cuerpo: unknown
): EntradaPostulacion {

  // Validar estructura general.

  if (
    !cuerpo ||
    typeof cuerpo !== "object" ||
    Array.isArray(cuerpo)
  ) {
    throw new Error("Datos inválidos.");
  }

  const datos = cuerpo as Record<string, unknown>;

  // Validar identificador de mascota.

  const id = datos.mascotaId;

  if (
    (
      typeof id !== "number" &&
      !(
        typeof id === "string" &&
        /^\d+$/.test(id)
      )
    ) ||
    !Number.isSafeInteger(Number(id)) ||
    Number(id) < 1 ||
    Number(id) > 2147483647
  ) {
    throw new Error("Mascota inválida.");
  }

  // Normalizar campos de texto.

  const telefono =
    typeof datos.telefono === "string"
      ? datos.telefono.trim()
      : "";

  const motivo =
    typeof datos.motivo === "string"
      ? datos.motivo.trim()
      : "";

  const vivienda =
    typeof datos.vivienda === "string"
      ? datos.vivienda.trim()
      : "";

  // Validar teléfono.

  if (
    telefono.length > 25 ||
    !/^[+0-9().\s-]+$/.test(telefono) ||
    telefono.replace(/\D/g, "").length < 7
  ) {
    throw new Error("Introduce un teléfono válido.");
  }

  // Validar tipo de vivienda.

  if (
    vivienda !== "casa" &&
    vivienda !== "departamento" &&
    vivienda !== "otro"
  ) {
    throw new Error("Vivienda inválida.");
  }

  // Validar motivación.

  if (
    motivo.length < 30 ||
    motivo.length > 1500
  ) {
    throw new Error(
      "Explica tu motivación en 30 a 1500 caracteres."
    );
  }

  // Confirmar responsabilidad del adoptante.

  if (datos.confirmacion !== "si") {
    throw new Error(
      "Confirma los datos de la postulación."
    );
  }

  // Retornar únicamente los campos autorizados.

  return {
    mascotaId: Number(id),
    telefono,
    vivienda,
    motivo
  };

}

// =============================================
// SERIALIZER DE RESPUESTA
// Estandarización de respuestas HTTP.
// =============================================

export function responderPostulacion(
  datos: RespuestaPostulacion,
  status = 200
): Response {

  return new Response(
    JSON.stringify({
      ok: datos.ok,
      mensaje: datos.mensaje
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );

}
