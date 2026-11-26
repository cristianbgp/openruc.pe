import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import iconv from "iconv-lite";
import { buildSnapshot } from "../../src/cli/import";
import type { AppConfig } from "../../src/config";
import { SnapshotWriter } from "../../src/database/importer";
import { SqlitePadronRepository } from "../../src/database/repository";
import { PIPELINE_VERSION, SCHEMA_VERSION } from "../../src/database/schema";

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function workspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ruc-import-"));
  directories.push(directory);
  return directory;
}

const fixtureConfig: AppConfig = {
  source: {
    listingUrl: "https://sunat.test/listing.html",
    fallbackZipUrls: [],
    encoding: "win1252",
    delimiter: "|",
  },
  dataset: { maxNombreChars: 120, maxDomicilioChars: 90, batchSize: 2 },
  api: { corsOrigins: ["*"], rateLimit: 120, rateWindowMs: 60_000 },
  databasePath: "unused.sqlite",
  port: 3000,
};

async function createZip(path: string, contents: string): Promise<void> {
  await Bun.write(
    path,
    zipSync({
      "padron.txt": new Uint8Array(iconv.encode(contents, "win1252")),
    }),
  );
}

test("builds and atomically publishes a SQLite snapshot from a local ZIP", async () => {
  const directory = await workspace();
  const zipPath = join(directory, "padron.zip");
  const targetPath = join(directory, "data", "padron.sqlite");
  const fixture = await readFile(
    join(import.meta.dir, "../fixtures/padron-small.txt"),
    "utf8",
  );
  await createZip(zipPath, fixture);

  const metadata = await buildSnapshot({
    config: fixtureConfig,
    localZipPath: zipPath,
    targetPath,
    workDir: join(directory, "work"),
    now: () => new Date("2026-08-20T00:00:00Z"),
  });

  expect(metadata).toMatchObject({ records: 2, duplicates: 1, discarded: 1 });
  const repository = SqlitePadronRepository.open(targetPath);
  expect(repository.lookup("20100047218")?.estado).toBe(0);
  expect(repository.metadata().source.sha256).toHaveLength(64);
  repository.close();
});

test("keeps the current snapshot when a candidate has invalid headers", async () => {
  const directory = await workspace();
  const targetPath = join(directory, "padron.sqlite");
  const writer = new SnapshotWriter(targetPath);
  writer.add({
    ruc: "20100047218",
    nombre: "CURRENT RECORD",
    estado: 0,
    condicion: 0,
    ubigeo: null,
    domicilio: null,
  });
  writer.finalize({
    schemaVersion: SCHEMA_VERSION,
    pipelineVersion: PIPELINE_VERSION,
    snapshot: "2026-08-19",
    generatedAt: "2026-08-19T00:00:00.000Z",
    source: {
      url: "old.zip",
      etag: null,
      lastModified: null,
      contentLength: null,
    },
    records: 1,
    discarded: 0,
    duplicates: 0,
  });
  const badZip = join(directory, "bad.zip");
  await createZip(badZip, "RUC|RAZON SOCIAL\n20100047218|BROKEN");

  await expect(
    buildSnapshot({
      config: fixtureConfig,
      localZipPath: badZip,
      targetPath,
      workDir: join(directory, "work"),
    }),
  ).rejects.toThrow("Missing required columns");

  const repository = SqlitePadronRepository.open(targetPath);
  expect(repository.lookup("20100047218")?.nombre).toBe("CURRENT RECORD");
  repository.close();
  expect(await Bun.file(`${targetPath}.next`).exists()).toBe(false);
});

test("summarizes unknown SUNAT status values without discarding the row", async () => {
  const directory = await workspace();
  const zipPath = join(directory, "unknown.zip");
  const targetPath = join(directory, "unknown.sqlite");
  await createZip(
    zipPath,
    [
      "RUC|RAZON SOCIAL|ESTADO|CONDICION|UBIGEO",
      "20100047218|EMPRESA NUEVA|ESTADO NUEVO|CONDICION NUEVA|150101",
    ].join("\n"),
  );
  const logs: string[] = [];

  const result = await buildSnapshot({
    config: fixtureConfig,
    localZipPath: zipPath,
    targetPath,
    workDir: join(directory, "work"),
    log: (message) => logs.push(message),
  });

  expect(result.records).toBe(1);
  expect(logs).toContain('Unknown estado values: {"ESTADO NUEVO":1}');
  expect(logs).toContain('Unknown condicion values: {"CONDICION NUEVA":1}');
});
