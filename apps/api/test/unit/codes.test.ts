import { expect, test } from "bun:test";
import { condicionLabel, estadoLabel } from "../../src/padron/codes";

test("returns known human-readable labels", () => {
  expect(estadoLabel(0)).toBe("ACTIVO");
  expect(condicionLabel(1)).toBe("NO HABIDO");
});

test("returns DESCONOCIDO for unmapped codes", () => {
  expect(estadoLabel(99)).toBe("DESCONOCIDO");
  expect(condicionLabel(99)).toBe("DESCONOCIDO");
});
