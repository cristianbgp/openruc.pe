import { expect, test } from "bun:test";
import { resolveApiOrigin } from "./api-origin";

test.each([
  [
    "https://openrucpe.localhost",
    true,
    undefined,
    "https://api.openrucpe.localhost",
  ],
  [
    "http://openrucpe.localhost:1355",
    true,
    undefined,
    "http://api.openrucpe.localhost:1355",
  ],
  [
    "http://docs.openrucpe.localhost:1355",
    true,
    undefined,
    "http://docs.api.openrucpe.localhost:1355",
  ],
  ["http://localhost:5173", true, undefined, "http://localhost:3000"],
  ["https://openruc.pe", false, undefined, "https://api.openruc.pe"],
  [
    "https://openruc.pe",
    false,
    "https://api.example.com/",
    "https://api.example.com",
  ],
])("links %s to the matching API origin", (site, dev, override, expected) => {
  expect(resolveApiOrigin(new URL(site), dev, override)).toBe(expected);
});
