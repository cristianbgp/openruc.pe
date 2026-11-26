import { condicionCode, estadoCode } from "./codes";
import type { HeaderIndex } from "./headers";
import type { PadronRecord } from "./types";

export interface ParserOptions {
  delimiter: string;
  maxNombreChars: number;
  maxDomicilioChars: number;
}

const ADDRESS_FIELDS: readonly (keyof HeaderIndex)[] = [
  "tipoVia",
  "nombreVia",
  "numero",
  "interior",
  "lote",
  "departamentoDir",
  "manzana",
  "kilometro",
  "tipoZona",
  "codigoZona",
];

const ADDRESS_PREFIXES: Readonly<Partial<Record<keyof HeaderIndex, string>>> = {
  interior: "INT.",
  lote: "LOTE",
  departamentoDir: "DPTO.",
  manzana: "MZ.",
  kilometro: "KM.",
};

export function cleanText(value: string): string {
  const cleaned = value.replaceAll("\0", " ").trim();
  if (cleaned === "" || cleaned === "-") return "";
  return cleaned.replace(/\s+/g, " ");
}

export function composeAddress(
  fields: string[],
  index: HeaderIndex,
  maxChars: number,
): string | null {
  const chunks: string[] = [];
  for (const name of ADDRESS_FIELDS) {
    const position = index[name];
    if (position === undefined) continue;
    const value = cleanText(fields[position] ?? "");
    if (!value) continue;
    const prefix = ADDRESS_PREFIXES[name];
    chunks.push(prefix ? `${prefix} ${value}` : value);
  }
  const address = chunks.join(" ").slice(0, maxChars).trim();
  return address || null;
}

export function parsePadronRow(
  line: string,
  index: HeaderIndex,
  options: ParserOptions,
): PadronRecord | null {
  const fields = line.replace(/[\r\n]+$/, "").split(options.delimiter);
  const ruc = fields[index.ruc]?.trim() ?? "";
  if (!/^\d{11}$/.test(ruc)) return null;

  const ubigeo = fields[index.ubigeo ?? -1]?.trim() ?? "";
  return {
    ruc,
    nombre: cleanText(fields[index.nombre] ?? "").slice(
      0,
      options.maxNombreChars,
    ),
    estado: estadoCode(cleanText(fields[index.estado] ?? "").toUpperCase()),
    condicion: condicionCode(
      cleanText(fields[index.condicion] ?? "").toUpperCase(),
    ),
    ubigeo: /^\d+$/.test(ubigeo) ? ubigeo : null,
    domicilio: composeAddress(fields, index, options.maxDomicilioChars),
  };
}
