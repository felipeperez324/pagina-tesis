
/**
 * KODAPP - CATÁLOGO PARA EL FUTURO MATCH
 *
 * Contiene las categorías estandarizadas.
 * Compartido entre formularios y APIs.
 */

export interface OpcionMatch {
  valor: string;
  etiqueta: string;
}

export const PERSONALIDADES: readonly OpcionMatch[] = [
  { valor: "tranquilo", etiqueta: "Tranquilo/a" },
  { valor: "carinoso", etiqueta: "Cariñoso/a" },
  { valor: "jugueton", etiqueta: "Juguetón/a" },
  { valor: "activo", etiqueta: "Activo/a y enérgico/a" },
  { valor: "timido", etiqueta: "Tímido/a" },
  { valor: "sociable", etiqueta: "Sociable" },
  { valor: "independiente", etiqueta: "Independiente" },
  { valor: "protector", etiqueta: "Protector/a" },

  // Matices adicionales.
  {
    valor: "tranquilo_carinoso",
    etiqueta: "Tranquilo/a y cariñoso/a"
  },
  {
    valor: "activo_jugueton",
    etiqueta: "Activo/a y juguetón/a"
  },
  {
    valor: "jugueton_sociable",
    etiqueta: "Juguetón/a y sociable"
  },
  {
    valor: "timido_carinoso",
    etiqueta: "Tímido/a y cariñoso/a"
  },
  {
    valor: "independiente_tranquilo",
    etiqueta: "Independiente y tranquilo/a"
  }
];

export const ANTECEDENTES_MEDICOS:
  readonly OpcionMatch[] = [
    {
      valor: "sin_antecedentes",
      etiqueta: "Sin antecedentes médicos conocidos"
    },
    {
      valor: "vacunacion_al_dia",
      etiqueta: "Vacunación al día"
    },
    {
      valor: "vacunacion_pendiente",
      etiqueta: "Vacunación pendiente"
    },
    {
      valor: "tratamiento",
      etiqueta: "En tratamiento médico"
    },
    {
      valor: "condicion_cronica",
      etiqueta: "Tiene una condición médica crónica"
    },
    {
      valor: "cuidados_especiales",
      etiqueta: "Requiere cuidados especiales"
    },
    {
      valor: "desconocido",
      etiqueta: "Antecedentes médicos desconocidos"
    }
  ];


/**
 * Resuelve una respuesta de desplegable.
 *
 * Para opciones estándar: guarda código y etiqueta.
 * Para "otro": guarda código y texto personalizado.
 */
export function procesarClasificacion(
  codigo: unknown,
  detalle: unknown,
  opciones: readonly OpcionMatch[],
  nombreCampo: string
):
  | { ok: true; codigo: string; texto: string }
  | { ok: false; mensaje: string } {

  if (typeof codigo !== "string" || !codigo) {
    return {
      ok: false,
      mensaje: `Selecciona ${nombreCampo}.`
    };
  }

  if (codigo === "otro") {
    if (typeof detalle !== "string") {
      return {
        ok: false,
        mensaje: `Describe ${nombreCampo}.`
      };
    }

    const texto = detalle.trim();

    if (texto.length < 3 || texto.length > 1500) {
      return {
        ok: false,
        mensaje:
          `La descripción de ${nombreCampo} ` +
          "debe tener entre 3 y 1500 caracteres."
      };
    }

    return {
      ok: true,
      codigo: "otro",
      texto
    };
  }

  const opcion = opciones.find(
    (item) => item.valor === codigo
  );

  if (!opcion) {
    return {
      ok: false,
      mensaje: `La opción de ${nombreCampo} no es válida.`
    };
  }

  return {
    ok: true,
    codigo: opcion.valor,
    texto: opcion.etiqueta
  };
}


/**
 * Permite editar mascotas antiguas.
 *
 * Si existe código, lo utiliza.
 * Si solo existe texto, busca una equivalencia.
 * Si no la encuentra, recupera el texto como "otro".
 */
export function seleccionarClasificacion(
  codigo: string | null | undefined,
  texto: string | null | undefined,
  opciones: readonly OpcionMatch[]
): string {

  if (
    typeof codigo === "string" &&
    (codigo === "otro" ||
      opciones.some((item) => item.valor === codigo))
  ) {
    return codigo;
  }

  if (!texto?.trim()) return "";

  const encontrada = opciones.find(
    (item) =>
      item.etiqueta.toLowerCase() ===
      texto.trim().toLowerCase()
  );

  return encontrada?.valor ?? "otro";
}
