const ESTADO_CODES: Readonly<Record<string, number>> = {
  ACTIVO: 0,
  "BAJA DE OFICIO": 1,
  "BAJA DEFINITIVA": 2,
  "BAJA PROVISIONAL": 3,
  "BAJA PROV. POR OFICI": 8,
  "SUSPENSION TEMPORAL": 4,
  "INHABILITADO-VENT.UNICA": 5,
  "INHABILITADO-VENT.UN": 5,
  "PENDIENTE DE INICIO DE ACTIVIDAD": 6,
  "PENDIENTE DE INI. DE": 6,
  "ANULACION DEL NUMERO INTERNO": 7,
  "NUM. INTERNO IDENTIF": 11,
  "BAJA NO ACTIV. SISEV": 9,
  "BAJA MULT.INSCR. Y O": 10,
  "OTROS OBLIGADOS": 12,
  "ANULACION - ERROR SU": 13,
  "ANULACION - ACTO ILI": 13,
  "ANUL.PROVI.-ACTO ILI": 13,
};

const ESTADO_LABELS: Readonly<Record<number, string>> = {
  0: "ACTIVO",
  1: "BAJA DE OFICIO",
  2: "BAJA DEFINITIVA",
  3: "BAJA PROVISIONAL",
  4: "SUSPENSION TEMPORAL",
  5: "INHABILITADO-VENT.UNICA",
  6: "PENDIENTE DE INICIO DE ACTIVIDAD",
  7: "ANULACION DEL NUMERO INTERNO",
  8: "BAJA PROVISIONAL POR OFICIO",
  9: "BAJA POR NO ACTIVIDAD",
  10: "BAJA MULTIPLE INSCRIPCION",
  11: "NUMERO INTERNO IDENTIFICATORIO",
  12: "OTROS OBLIGADOS",
  13: "ANULACION",
  255: "DESCONOCIDO",
};

const CONDICION_CODES: Readonly<Record<string, number>> = {
  HABIDO: 0,
  "NO HABIDO": 1,
  "NO HALLADO": 2,
  "POR VERIFICAR": 3,
  PENDIENTE: 4,
  "": 5,
  "NO APLICABLE": 6,
};

const CONDICION_LABELS: Readonly<Record<number, string>> = {
  0: "HABIDO",
  1: "NO HABIDO",
  2: "NO HALLADO",
  3: "POR VERIFICAR",
  4: "PENDIENTE",
  5: "-",
  6: "NO APLICABLE",
  255: "DESCONOCIDO",
};

export function estadoCode(raw: string): number {
  return ESTADO_CODES[raw] ?? 255;
}

export function condicionCode(raw: string): number {
  if (raw.startsWith("NO HALLADO")) return 2;
  return CONDICION_CODES[raw] ?? 255;
}

export function estadoLabel(code: number): string {
  return ESTADO_LABELS[code] ?? "DESCONOCIDO";
}

export function condicionLabel(code: number): string {
  return CONDICION_LABELS[code] ?? "DESCONOCIDO";
}
