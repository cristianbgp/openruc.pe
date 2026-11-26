import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppConfig } from "../../src/config";
import { SnapshotWriter } from "../../src/database/importer";
import { SqlitePadronRepository } from "../../src/database/repository";
import { PIPELINE_VERSION, SCHEMA_VERSION } from "../../src/database/schema";
import { startServer } from "../../src/server";

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

test("starts on an ephemeral port and closes its repository once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ruc-server-"));
  directories.push(directory);
  const databasePath = join(directory, "padron.sqlite");
  const writer = new SnapshotWriter(databasePath);
  writer.add({
    ruc: "20100047218",
    nombre: "BANCO DE CREDITO DEL PERU",
    estado: 0,
    condicion: 0,
    ubigeo: null,
    domicilio: null,
  });
  writer.finalize({
    schemaVersion: SCHEMA_VERSION,
    pipelineVersion: PIPELINE_VERSION,
    snapshot: "2026-08-19",
    generatedAt: "2026-08-20T00:00:00.000Z",
    source: {
      url: "fixture.zip",
      etag: null,
      lastModified: null,
      contentLength: null,
    },
    records: 1,
    discarded: 0,
    duplicates: 0,
  });
  const repository = SqlitePadronRepository.open(databasePath);
  const config: AppConfig = {
    source: {
      listingUrl: "https://sunat.test",
      fallbackZipUrls: [],
      encoding: "win1252",
      delimiter: "|",
    },
    dataset: { maxNombreChars: 120, maxDomicilioChars: 90, batchSize: 10_000 },
    api: { corsOrigins: ["*"], rateLimit: 120, rateWindowMs: 60_000 },
    databasePath,
    port: 0,
  };

  const running = startServer(config, { repository, log: () => undefined });
  const response = await fetch(`http://127.0.0.1:${running.port}/health`);
  expect(response.status).toBe(200);
  await running.stop();
  await running.stop();
  expect(repository.isReady()).toBe(false);
});

test("refuses startup when the configured snapshot is invalid", async () => {
  const config = {
    source: {
      listingUrl: "https://sunat.test",
      fallbackZipUrls: [],
      encoding: "win1252",
      delimiter: "|",
    },
    dataset: { maxNombreChars: 120, maxDomicilioChars: 90, batchSize: 10_000 },
    api: { corsOrigins: ["*"], rateLimit: 120, rateWindowMs: 60_000 },
    databasePath: "/definitely/missing/padron.sqlite",
    port: 0,
  } satisfies AppConfig;
  expect(() => startServer(config)).toThrow();
});
