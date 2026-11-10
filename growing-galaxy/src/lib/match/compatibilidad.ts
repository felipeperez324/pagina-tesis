
/**
 * KODAPP - MOTOR DE COMPATIBILIDAD MATCH
 *
 * Calcula la compatibilidad entre un adoptante
 * y una mascota utilizando tres criterios:
 *
 * 1. Tipo de mascota (30%)
 * 2. Personalidad (45%)
 * 3. Cuidados médicos (25%)
 *
 * No modifica bases de datos.
 * No aprueba ni rechaza postulaciones.
 */

export type PreferenciasMatch = {
  tipo_preferido: string | null;
  personalidad_preferida: string | null;
  nivel_cuidados: string | null;
};

export type MascotaMatch = {
  tipo_mascota: string | null;
  personalidad_codigo: string | null;
  salud_codigo: string | null;
};

export type NivelMatch =
  | "baja"
  | "moderada"
  | "buena"
  | "muy_alta"
  | "sin_datos";

export type ResultadoMatch = {
  porcentaje: number | null;
  nivel: NivelMatch;
  cobertura: number;
  coincidencias: string[];
  advertencias: string[];
};

type Comparacion = {
  valor: number | null;
  coincidencia?: string;
  advertencia?: string;
};

const PESO_TIPO = 30;
const PESO_PERSONALIDAD = 45;
const PESO_CUIDADOS = 25;

const PERSONALIDADES_BASE = new Set([
  "tranquilo",
  "carinoso",
  "jugueton",
  "activo",
  "timido",
  "sociable",
  "independiente",
  "protector"
]);

function normalizar(
  valor: string | null | undefined
): string {
  return (valor ?? "")
    .trim()
    .toLowerCase();
}

// ==========================================
// COMPARAR TIPO DE MASCOTA
// ==========================================

function compararTipo(
  preferido: string,
  tipoMascota: string
): Comparacion {

  if (!preferido || !tipoMascota) {
    return {
      valor: null,
      advertencia:
        "Falta información sobre el tipo de mascota."
    };
  }

  if (preferido === "indiferente") {
    return {
      valor: 1,
      coincidencia:
        "No tienes restricciones sobre el tipo de mascota."
    };
  }

  if (preferido === tipoMascota) {
    return {
      valor: 1,
      coincidencia:
        "Coincide con el tipo de mascota que buscas."
    };
  }

  return {
    valor: 0,
    advertencia:
      "El tipo de mascota difiere de tu preferencia."
  };
}

// ==========================================
// COMPARAR PERSONALIDAD
// ==========================================

function obtenerPersonalidades(
  codigo: string
): string[] {

  return codigo
    .split("_")
    .filter((parte) =>
      PERSONALIDADES_BASE.has(parte)
    );
}

function compararPersonalidad(
  preferida: string,
  personalidadMascota: string
): Comparacion {

  if (!preferida || !personalidadMascota) {
    return {
      valor: null,
      advertencia:
        "Falta información sobre la personalidad."
    };
  }

  if (preferida === "indiferente") {
    return {
      valor: 1,
      coincidencia:
        "No tienes una preferencia de personalidad específica."
    };
  }

  if (
    preferida === "otro" ||
    personalidadMascota === "otro"
  ) {
    return {
      valor: null,
      advertencia:
        "La personalidad requiere una revisión individual."
    };
  }

  if (preferida === personalidadMascota) {
    return {
      valor: 1,
      coincidencia:
        "La personalidad coincide con tu preferencia."
    };
  }

  const buscadas =
    obtenerPersonalidades(preferida);

  const encontradas =
    obtenerPersonalidades(personalidadMascota);

  if (
    buscadas.length === 0 ||
    encontradas.length === 0
  ) {
    return {
      valor: null,
      advertencia:
        "No hay una clasificación de personalidad comparable."
    };
  }

  const compartidas = buscadas.filter(
    (personalidad) =>
      encontradas.includes(personalidad)
  );

  if (compartidas.length > 0) {
    return {
      valor: 0.75,
      coincidencia:
        "La mascota presenta características de personalidad afines a tus preferencias."
    };
  }

  return {
    valor: 0,
    advertencia:
      "La personalidad presenta diferencias con tus preferencias."
  };
}

// ==========================================
// COMPARAR CUIDADOS MÉDICOS
// ==========================================

function compararCuidados(
  disponibilidad: string,
  salud: string
): Comparacion {

  if (!disponibilidad || !salud) {
    return {
      valor: null,
      advertencia:
        "Faltan datos para evaluar los cuidados médicos."
    };
  }

  if (
    salud === "desconocido" ||
    salud === "otro"
  ) {
    return {
      valor: null,
      advertencia:
        "Los antecedentes médicos deben confirmarse con la organización."
    };
  }

  const cuidadosBasicos = [
    "sin_antecedentes",
    "vacunacion_al_dia"
  ];

  if (cuidadosBasicos.includes(salud)) {
    return {
      valor: 1,
      coincidencia:
        "No se registran necesidades médicas especiales."
    };
  }

  if (salud === "vacunacion_pendiente") {
    return {
      valor: 0.85,
      advertencia:
        "La mascota tiene vacunación pendiente. Consulta sus necesidades veterinarias."
    };
  }

  if (
    salud === "tratamiento" ||
    salud === "condicion_cronica"
  ) {

    if (
      disponibilidad === "tratamientos" ||
      disponibilidad === "especiales"
    ) {
      return {
        valor: 1,
        coincidencia:
          "Declaraste disponibilidad para asumir tratamientos médicos."
      };
    }

    if (disponibilidad === "indiferente") {
      return {
        valor: null,
        advertencia:
          "Es necesario confirmar si puedes asumir el tratamiento médico requerido."
      };
    }

    return {
      valor: 0,
      advertencia:
        "La mascota requiere atención médica que podría superar los cuidados que declaraste poder asumir."
    };
  }

  if (salud === "cuidados_especiales") {

    if (disponibilidad === "especiales") {
      return {
        valor: 1,
        coincidencia:
          "Declaraste disponibilidad para cuidados especiales."
      };
    }

    return {
      valor:
        disponibilidad === "indiferente"
          ? null
          : 0,

      advertencia:
        "La mascota requiere cuidados especiales. La organización debe revisar si puedes asumirlos."
    };
  }

  return {
    valor: null,
    advertencia:
      "No se pudo clasificar el nivel de cuidados requerido."
  };
}

// ==========================================
// CALCULAR COMPATIBILIDAD
// ==========================================

export function calcularCompatibilidad(
  preferencias: PreferenciasMatch,
  mascota: MascotaMatch
): ResultadoMatch {

  const coincidencias: string[] = [];
  const advertencias: string[] = [];

  let puntos = 0;
  let pesoEvaluado = 0;

  function agregar(
    comparacion: Comparacion,
    peso: number
  ): void {

    if (comparacion.valor !== null) {
      puntos += comparacion.valor * peso;
      pesoEvaluado += peso;
    }

    if (comparacion.coincidencia) {
      coincidencias.push(
        comparacion.coincidencia
      );
    }

    if (comparacion.advertencia) {
      advertencias.push(
        comparacion.advertencia
      );
    }
  }

  // TIPO DE MASCOTA

  agregar(
    compararTipo(
      normalizar(preferencias.tipo_preferido),
      normalizar(mascota.tipo_mascota)
    ),
    PESO_TIPO
  );

  // PERSONALIDAD

  agregar(
    compararPersonalidad(
      normalizar(
        preferencias.personalidad_preferida
      ),
      normalizar(mascota.personalidad_codigo)
    ),
    PESO_PERSONALIDAD
  );

  // CUIDADOS MÉDICOS

  agregar(
    compararCuidados(
      normalizar(preferencias.nivel_cuidados),
      normalizar(mascota.salud_codigo)
    ),
    PESO_CUIDADOS
  );

  // COBERTURA DE INFORMACIÓN

  const cobertura = pesoEvaluado;

  // EVITAR PORCENTAJES CON POCOS DATOS

  if (pesoEvaluado < 55) {
    return {
      porcentaje: null,
      nivel: "sin_datos",
      cobertura,
      coincidencias,
      advertencias: [
        ...advertencias,
        "No existe información suficiente para calcular el Match."
      ]
    };
  }

  // CALCULAR RESULTADO

  const porcentaje = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (puntos / pesoEvaluado) * 100
      )
    )
  );

  // CLASIFICAR RESULTADO

  let nivel: NivelMatch;

  if (porcentaje < 50) {
    nivel = "baja";
  } else if (porcentaje < 70) {
    nivel = "moderada";
  } else if (porcentaje < 85) {
    nivel = "buena";
  } else {
    nivel = "muy_alta";
  }

  // ADVERTENCIA SOBRE DATOS PARCIALES

  if (pesoEvaluado < 100) {
    advertencias.push(
      "Resultado parcial: algunos criterios no pudieron evaluarse."
    );
  }

  return {
    porcentaje,
    nivel,
    cobertura,
    coincidencias,
    advertencias
  };
}
