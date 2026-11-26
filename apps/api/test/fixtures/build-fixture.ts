import { mkdir, rm } from "node:fs/promises";
import { SnapshotWriter } from "../../src/database/importer";
import { PIPELINE_VERSION, SCHEMA_VERSION } from "../../src/database/schema";
import { rucCheckDigit } from "../../src/padron/ruc";

const path = "data/padron.sqlite";
await mkdir("data", { recursive: true });
await rm(path, { force: true });

const writer = new SnapshotWriter(path);
writer.add({
  ruc: "20100047218",
  nombre: "BANCO DE CREDITO DEL PERU",
  estado: 0,
  condicion: 0,
  ubigeo: "150114",
  domicilio: "JR. CENTENARIO 156 LADERAS DE MELGAREJO",
});
const secondFirstTen = "2099999999";
writer.add({
  ruc: `${secondFirstTen}${rucCheckDigit(secondFirstTen)}`,
  nombre: "EMPRESA DE EJEMPLO SAC",
  estado: 2,
  condicion: 1,
  ubigeo: null,
  domicilio: null,
});
writer.finalize({
  schemaVersion: SCHEMA_VERSION,
  pipelineVersion: PIPELINE_VERSION,
  snapshot: "2026-08-19",
  generatedAt: "2026-08-20T00:00:00.000Z",
  source: {
    url: "fixture://padron-small.zip",
    etag: "fixture-v2",
    lastModified: null,
    contentLength: null,
    sha256: "fixture",
  },
  records: 2,
  discarded: 0,
  duplicates: 0,
});

console.log(`Created ${path} with 2 deterministic records.`);
