
import { PERSONALIDADES } from "./CatalogoMatch";
import { COMUNAS_BIOBIO } from "./catalogosMascotas";

// ==========================================
// KODAAPP - SERIALIZER DEL MATCH
// ==========================================

export interface PreferenciasMatch {
  tipoPreferido: string;
  personalidadPreferida: string;
  nivelCuidados: string;
  comunaPreferida: string;
}

type ResultadoMatch =
  | { ok: true; datos: PreferenciasMatch }
  | { ok: false; mensaje: string };

// ==========================================
// VALIDACIÓN Y NORMALIZACIÓN
// ==========================================

export function leerPreferenciasMatch(
  cuerpo: unknown
): ResultadoMatch {

  const error = (mensaje: string) => ({
    ok: false as const,
    mensaje
  });

  // Validar estructura de entrada.

  if (
    !cuerpo ||
    typeof cuerpo !== "object" ||
    Array.isArray(cuerpo)
  ) {
    return error("Datos inválidos.");
  }

  const datos = cuerpo as Record<string, unknown>;

  // Normalizar campos de texto.

  const texto = (campo: string) =>
    typeof datos[campo] === "string"
      ? (datos[campo] as string).trim()
      : "";

  const tipoPreferido = texto("tipoPreferido");

  const personalidadPreferida =
    texto("personalidadPreferida");

  const nivelCuidados = texto("nivelCuidados");

  const comunaPreferida = texto("comunaPreferida");

  // ========================================
  // VALIDAR COMUNA
  // ========================================

  if (!COMUNAS_BIOBIO.includes(comunaPreferida)) {
    return error(
      "Selecciona una comuna válida del Biobío."
    );
  }

  // ========================================
  // VALIDAR TIPO DE MASCOTA
  // ========================================

  if (
    !["perro", "gato", "otro", "indiferente"]
      .includes(tipoPreferido)
  ) {
    return error(
      "Selecciona un tipo de mascota válido."
    );
  }

  // ========================================
  // VALIDAR PERSONALIDAD
  // ========================================

  const personalidadesValidas = [
    ...PERSONALIDADES.map(item => item.valor),
    "indiferente"
  ];

  if (
    !personalidadesValidas.includes(
      personalidadPreferida
    )
  ) {
    return error(
      "Selecciona una personalidad válida."
    );
  }

  // ========================================
  // VALIDAR NIVEL DE CUIDADOS
  // ========================================

  if (
    ![
      "basicos",
      "tratamientos",
      "especiales",
      "indiferente"
    ].includes(nivelCuidados)
  ) {
    return error(
      "Selecciona un nivel de cuidados válido."
    );
  }

  // ========================================
  // RETORNAR CAMPOS AUTORIZADOS
  // ========================================

  return {
    ok: true,

    datos: {
      tipoPreferido,
      personalidadPreferida,
      nivelCuidados,
      comunaPreferida
    }
  };

}
