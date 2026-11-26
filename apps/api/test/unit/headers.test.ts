import { expect, test } from "bun:test";
import { buildHeaderIndex } from "../../src/padron/headers";

test("maps accented and reordered SUNAT headers", () => {
  expect(
    buildHeaderIndex([
      "CONDICIÓN DE DOMICILIO",
      "NÚMERO RUC",
      "RAZÓN SOCIAL",
      "ESTADO DEL CONTRIBUYENTE",
      "UBIGEO",
    ]),
  ).toMatchObject({
    condicion: 0,
    ruc: 1,
    nombre: 2,
    estado: 3,
    ubigeo: 4,
  });
});

test("rejects missing required headers", () => {
  expect(() => buildHeaderIndex(["RUC", "RAZON SOCIAL"])).toThrow(
    "Missing required columns: estado, condicion",
  );
});
