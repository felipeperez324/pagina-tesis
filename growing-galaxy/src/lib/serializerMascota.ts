
import {
  COMUNAS_BIOBIO,
  RAZAS_POR_TIPO
} from "./catalogosMascotas";

import {
  PERSONALIDADES,
  ANTECEDENTES_MEDICOS,
  procesarClasificacion
} from "./CatalogoMatch";

// =============================================
// SERIALIZER DE MASCOTAS
// =============================================

export function leerMascota(form: FormData) {

  const error = (mensaje: string) => ({
    ok: false as const,
    mensaje
  });

  // Campos de texto autorizados.

  const campos = [
    "nombre",
    "tipoMascota",
    "descripcion",
    "raza",
    "edadMeses",
    "sexo",
    "tamano",
    "ubicacion",
    "requisitosAdopcion",
    "esterilizado",
    "vacunasAlDia",
    "personalidadCodigo",
    "personalidadDetalle",
    "saludCodigo",
    "saludDetalle"
  ];

  // Impedir campos duplicados o archivos
  // enviados en lugar de textos.

  for (const campo of campos) {

    const valores = form.getAll(campo);

    if (
      valores.length > 1 ||
      valores.some(v => typeof v !== "string")
    ) {
      return error(`Campo inválido: ${campo}.`);
    }

  }

  // =============================================
  // NORMALIZACIÓN
  // =============================================

  const texto = (
    campo: string,
    defecto = ""
  ) => String(form.get(campo) ?? defecto).trim();

  const nombre = texto("nombre");
  const tipo = texto("tipoMascota");
  const descripcion = texto("descripcion");
  const raza = texto("raza");

  const edadTexto = texto("edadMeses");

  const edadMeses =
    edadTexto === "" ? null : Number(edadTexto);

  const sexo = texto("sexo", "desconocido");
  const tamano = texto("tamano", "desconocido");
  const ubicacion = texto("ubicacion");
  const requisitos = texto("requisitosAdopcion");

  const esterilizadoTexto = texto(
    "esterilizado",
    "desconocido"
  );

  const vacunasTexto = texto(
    "vacunasAlDia",
    "desconocido"
  );

  // =============================================
  // VALIDACIONES BÁSICAS
  // =============================================

  if (!nombre || nombre.length > 100) {
    return error("Nombre inválido.");
  }

  if (!["perro", "gato", "otro"].includes(tipo)) {
    return error("Tipo de mascota inválido.");
  }

  if (descripcion.length > 5000) {
    return error("Descripción demasiado larga.");
  }

  if (
    raza.length > 100 ||
    ubicacion.length > 120 ||
    requisitos.length > 2000
  ) {
    return error(
      "Raza, ubicación o requisitos demasiado largos."
    );
  }

  // =============================================
  // VALIDAR COMUNA Y RAZA
  // =============================================

  if (!COMUNAS_BIOBIO.includes(ubicacion)) {
    return error(
      "Selecciona una comuna válida del Biobío."
    );
  }

  const razasPermitidas =
    RAZAS_POR_TIPO[tipo] ?? [];

  if (!razasPermitidas.includes(raza)) {
    return error(
      "Selecciona una raza válida para el tipo de mascota."
    );
  }

  // =============================================
  // VALIDAR EDAD
  // =============================================

  if (
    edadMeses !== null &&
    (
      !/^\d+$/.test(edadTexto) ||
      !Number.isInteger(edadMeses) ||
      edadMeses < 0 ||
      edadMeses > 360
    )
  ) {
    return error(
      "La edad debe estar entre 0 y 360 meses."
    );
  }

  // =============================================
  // VALIDAR CARACTERÍSTICAS
  // =============================================

  if (
    !["macho", "hembra", "desconocido"]
      .includes(sexo) ||

    !["pequeno", "mediano", "grande", "desconocido"]
      .includes(tamano) ||

    !["si", "no", "desconocido"]
      .includes(esterilizadoTexto) ||

    !["si", "no", "desconocido"]
      .includes(vacunasTexto)
  ) {
    return error(
      "Revisa las características de la mascota."
    );
  }

  // =============================================
  // VALIDAR PERSONALIDAD Y SALUD
  // =============================================

  const personalidad = procesarClasificacion(
    form.get("personalidadCodigo"),
    form.get("personalidadDetalle"),
    PERSONALIDADES,
    "la personalidad"
  );

  if (!personalidad.ok) {
    return error(personalidad.mensaje);
  }

  const salud = procesarClasificacion(
    form.get("saludCodigo"),
    form.get("saludDetalle"),
    ANTECEDENTES_MEDICOS,
    "los antecedentes médicos"
  );

  if (!salud.ok) {
    return error(salud.mensaje);
  }

  // Evitar información médica contradictoria.

  if (
    (
      salud.codigo === "vacunacion_pendiente" &&
      vacunasTexto === "si"
    ) ||
    (
      salud.codigo === "vacunacion_al_dia" &&
      vacunasTexto === "no"
    )
  ) {
    return error(
      "La vacunación y los antecedentes médicos se contradicen."
    );
  }

  // =============================================
  // TRANSFORMACIÓN DE TIPOS
  // =============================================

  const booleano = (
    valor: string
  ): boolean | null => {

    if (valor === "si") return true;
    if (valor === "no") return false;

    return null;
  };

  // =============================================
  // DATOS NORMALIZADOS
  // =============================================

  return {
    ok: true as const,

    datos: {
      nombre,
      tipo,
      descripcion,
      raza,
      edadMeses,
      sexo,
      tamano,
      ubicacion,
      requisitos,
      personalidad,
      salud,
      esterilizado: booleano(esterilizadoTexto),
      vacunas: booleano(vacunasTexto)
    }
  };

}
