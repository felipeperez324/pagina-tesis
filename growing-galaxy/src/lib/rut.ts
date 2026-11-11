
/**
 * KODAPP - VALIDACIÓN DE RUT CHILENO
 *
 * Módulo 11.
 * Comprueba formato y dígito verificador.
 * NO verifica existencia real ni identidad.
 */

export function normalizarRut(valor: string): string | null {
  if (typeof valor !== "string") return null;

  const limpio = valor
    .trim()
    .toUpperCase()
    .replace(/[.\-\s]/g, "");

  if (!/^[0-9]{1,8}[0-9K]$/.test(limpio)) {
    return null;
  }

  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);

  if (
    cuerpo.length > 8 ||
    Number(cuerpo) === 0 ||
    (cuerpo.length > 1 && cuerpo.startsWith("0"))
  ) {
    return null;
  }

  return `${cuerpo}-${dv}`;
}

export function calcularDigitoVerificador(
  cuerpo: string
): string | null {
  if (!/^[0-9]{1,8}$/.test(cuerpo)) {
    return null;
  }

  let suma = 0;
  let multiplicador = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;

    multiplicador =
      multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resultado = 11 - (suma % 11);

  if (resultado === 11) return "0";
  if (resultado === 10) return "K";

  return String(resultado);
}

export function validarRut(valor: string): boolean {
  const normalizado = normalizarRut(valor);

  if (!normalizado) return false;

  const [cuerpo, dv] = normalizado.split("-");

  return calcularDigitoVerificador(cuerpo) === dv;
}

export function formatearRut(valor: string): string {
  const normalizado = normalizarRut(valor);

  if (!normalizado) return valor.trim();

  const [cuerpo, dv] = normalizado.split("-");

  const cuerpoFormateado = cuerpo.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    "."
  );

  return `${cuerpoFormateado}-${dv}`;
}
