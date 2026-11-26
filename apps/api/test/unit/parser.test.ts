import { expect, test } from "bun:test";
import { buildHeaderIndex } from "../../src/padron/headers";
import { parsePadronRow } from "../../src/padron/parser";

const headers = [
  "RUC",
  "RAZON SOCIAL",
  "ESTADO",
  "CONDICION",
  "UBIGEO",
  "TIPO DE VIA",
  "NOMBRE DE VIA",
  "NUMERO",
  "INTERIOR",
  "TIPO DE ZONA",
  "CODIGO DE ZONA",
];
const index = buildHeaderIndex(headers);
const options = {
  delimiter: "|",
  maxNombreChars: 120,
  maxDomicilioChars: 90,
};

test("normalizes one SUNAT record", () => {
  expect(
    parsePadronRow(
      "20100047218| BANCO DE CREDITO  DEL PERU |ACTIVO|HABIDO|150114|JR.|CENTENARIO|156|-|LADERAS DE MELGAREJO|URB.",
      index,
      options,
    ),
  ).toEqual({
    ruc: "20100047218",
    nombre: "BANCO DE CREDITO DEL PERU",
    estado: 0,
    condicion: 0,
    ubigeo: "150114",
    domicilio: "JR. CENTENARIO 156 LADERAS DE MELGAREJO",
  });
});

test("returns null for malformed source RUCs", () => {
  expect(
    parsePadronRow("ABC|NAME|ACTIVO|HABIDO|||||", index, options),
  ).toBeNull();
});

test("maps unknown codes and empty optional fields", () => {
  expect(
    parsePadronRow(
      "20999999999|UNKNOWN COMPANY|NEW STATE|NEW CONDITION|||||",
      index,
      options,
    ),
  ).toEqual({
    ruc: "20999999999",
    nombre: "UNKNOWN COMPANY",
    estado: 255,
    condicion: 255,
    ubigeo: null,
    domicilio: null,
  });
});

test("truncates names and addresses to configured limits", () => {
  expect(
    parsePadronRow(
      "20100047218|LONG COMPANY NAME|ACTIVO|NO HALLADO POR DIRECCION|150131|AV.|AREQUIPA|1155|201",
      index,
      { delimiter: "|", maxNombreChars: 4, maxDomicilioChars: 12 },
    ),
  ).toMatchObject({
    nombre: "LONG",
    condicion: 2,
    domicilio: "AV. AREQUIPA",
  });
});
