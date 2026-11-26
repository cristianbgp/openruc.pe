export interface HeaderIndex {
  ruc: number;
  nombre: number;
  estado: number;
  condicion: number;
  ubigeo?: number;
  tipoVia?: number;
  nombreVia?: number;
  numero?: number;
  interior?: number;
  lote?: number;
  departamentoDir?: number;
  manzana?: number;
  kilometro?: number;
  tipoZona?: number;
  codigoZona?: number;
}

type HeaderName = keyof HeaderIndex;

const ALIASES: Readonly<Record<HeaderName, readonly string[]>> = {
  ruc: ["RUC", "NUMERO RUC", "NRO RUC"],
  nombre: [
    "NOMBRE O RAZON SOCIAL",
    "RAZON SOCIAL",
    "NOMBRE RAZON SOCIAL",
    "APELLIDOS Y NOMBRES O RAZON SOCIAL",
    "NOMBRE",
  ],
  estado: ["ESTADO DEL CONTRIBUYENTE", "ESTADO CONTRIBUYENTE", "ESTADO"],
  condicion: ["CONDICION DE DOMICILIO", "CONDICION DOMICILIO", "CONDICION"],
  ubigeo: ["UBIGEO", "CODIGO UBIGEO"],
  tipoVia: ["TIPO DE VIA", "TIPO VIA"],
  nombreVia: ["NOMBRE DE VIA", "NOMBRE VIA"],
  numero: ["NUMERO", "NRO"],
  interior: ["INTERIOR", "INT"],
  lote: ["LOTE"],
  departamentoDir: ["DEPARTAMENTO"],
  manzana: ["MANZANA", "MZA", "MZ"],
  kilometro: ["KILOMETRO", "KM"],
  tipoZona: ["TIPO ZONA", "TIPO DE ZONA"],
  codigoZona: ["CODIGO ZONA", "COD ZONA", "NOMBRE ZONA"],
};

export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function buildHeaderIndex(fields: string[]): HeaderIndex {
  const normalized = fields.map(normalizeHeader);
  const positions = new Map<HeaderName, number>();

  for (const [name, aliases] of Object.entries(ALIASES) as [
    HeaderName,
    readonly string[],
  ][]) {
    const position = aliases
      .map(normalizeHeader)
      .map((alias) => normalized.indexOf(alias))
      .find((candidate) => candidate >= 0);
    if (position !== undefined) positions.set(name, position);
  }

  const required = ["ruc", "nombre", "estado", "condicion"] as const;
  const missing = required.filter((name) => !positions.has(name));
  if (missing.length > 0) {
    throw new Error(
      `Missing required columns: ${missing.join(", ")}. Found: ${normalized.join(", ")}`,
    );
  }

  return Object.fromEntries(positions) as unknown as HeaderIndex;
}
