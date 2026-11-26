// Parámetros de navegación compartidos por ambos listados.
export const MASCOTAS_POR_PAGINA = 9;

export function leerBusqueda(url: URL): string {
  return (url.searchParams.get("q") ?? "").trim().slice(0, 100);
}

export function calcularPagina(url: URL, total: number) {
  const valor = url.searchParams.get("pagina") ?? "1";
  const solicitada = /^\d+$/.test(valor) ? Number(valor) : 1;
  const paginas = Math.max(1, Math.ceil(total / MASCOTAS_POR_PAGINA));
  const pagina = Number.isSafeInteger(solicitada)
    ? Math.min(paginas, Math.max(1, solicitada)) : 1;
  return { pagina, paginas, offset: (pagina - 1) * MASCOTAS_POR_PAGINA };
}

export function enlacePagina(ruta: string, filtros: Record<string, string>, pagina = 1) {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor) params.set(clave, valor);
  }
  if (pagina > 1) params.set("pagina", String(pagina));
  const query = params.toString();
  return query ? `${ruta}?${query}` : ruta;
}
