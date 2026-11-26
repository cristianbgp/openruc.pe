import { describe, expect, test } from "bun:test";
import { isValidRuc, normalizeRuc, rucCheckDigit } from "../../src/padron/ruc";

describe("RUC rules", () => {
  test("normalizes presentation characters", () => {
    expect(normalizeRuc("20 10004721-8")).toBe("20100047218");
  });

  test("computes SUNAT's modulo-11 check digit", () => {
    expect(rucCheckDigit("2010004721")).toBe(8);
  });

  test("rejects a check-digit input that is not ten digits", () => {
    expect(() => rucCheckDigit("201000472")).toThrow("Expected ten digits");
  });

  test("accepts only eleven digits with a matching check digit", () => {
    expect(isValidRuc("20100047218")).toBe(true);
    expect(isValidRuc("20100047219")).toBe(false);
    expect(isValidRuc("2010004721")).toBe(false);
  });
});
