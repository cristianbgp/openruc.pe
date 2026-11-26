import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SnapshotWriter } from "../../src/database/importer";
import { SqlitePadronRepository } from "../../src/database/repository";
import { validateSnapshot } from "../../src/database/validate";
import type { SnapshotMetadata } from "../../src/padron/types";

const directories: string[] = [];
const record = {
  ruc: "20100047218",
  nombre: "BANCO DE CREDITO DEL PERU",
  estado: 0,
  condicion: 0,
  ubigeo: "150114",
  domicilio: null,
};

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

async function temporaryPath(name = "padron.sqlite"): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ruc-db-"));
  directories.push(directory);
  return join(directory, name);
}

function metadata(overrides: Partial<SnapshotMetadata> = {}): SnapshotMetadata {
  return {
    schemaVersion: 1,
    pipelineVersion: "v3|sqlite|dom=90",
    snapshot: "2026-08-19",
    generatedAt: "2026-08-20T00:00:00Z",
    source: {
      url: "fixture.zip",
      etag: null,
      lastModified: null,
      contentLength: null,
      sha256: "abc",
    },
    records: 1,
    discarded: 0,
    duplicates: 1,
    ...overrides,
  };
}

test("writes a record, ignores a duplicate, and reopens read-only", async () => {
  const path = await temporaryPath();
  const writer = new SnapshotWriter(path);
  expect(writer.add(record)).toBe("inserted");
  expect(writer.add(record)).toBe("duplicate");
  writer.finalize(metadata());

  expect(validateSnapshot(path).records).toBe(1);
  const repository = SqlitePadronRepository.open(path);
  expect(repository.isReady()).toBe(true);
  expect(repository.lookup("20100047218")?.nombre).toBe(
    "BANCO DE CREDITO DEL PERU",
  );
  expect(repository.lookup("20999999999")).toBeNull();
  expect(repository.metadata().snapshot).toBe("2026-08-19");
  repository.close();
  expect(repository.isReady()).toBe(false);
});

test("rejects a corrupt database", async () => {
  const path = await temporaryPath();
  await writeFile(path, "not sqlite");
  expect(() => validateSnapshot(path)).toThrow();
});

test("rejects an empty snapshot", async () => {
  const path = await temporaryPath();
  const writer = new SnapshotWriter(path);
  writer.finalize(metadata({ records: 0, duplicates: 0 }));
  expect(() => validateSnapshot(path)).toThrow("Snapshot has no records");
});

test("rejects an unsupported schema version", async () => {
  const path = await temporaryPath();
  const writer = new SnapshotWriter(path);
  writer.add({
    ruc: "20100047218",
    nombre: "BANCO DE CREDITO DEL PERU",
    estado: 0,
    condicion: 0,
    ubigeo: null,
    domicilio: null,
  });
  writer.finalize(metadata({ schemaVersion: 2, duplicates: 0 }));
  expect(() => validateSnapshot(path)).toThrow("Unsupported schema version: 2");
});

test("rejects metadata whose record count differs from SQLite", async () => {
  const path = await temporaryPath();
  const writer = new SnapshotWriter(path);
  writer.add({
    ruc: "20100047218",
    nombre: "BANCO DE CREDITO DEL PERU",
    estado: 0,
    condicion: 0,
    ubigeo: null,
    domicilio: null,
  });
  writer.finalize(metadata({ duplicates: 0 }));

  const database = new Database(path);
  database.query("UPDATE metadata SET value = '2' WHERE key = 'records'").run();
  database.close();

  expect(() => validateSnapshot(path)).toThrow(
    "Metadata record count 2 does not match SQLite count 1",
  );
});

test("rejects malformed source metadata and negative counters", async () => {
  const path = await temporaryPath("invalid-metadata.sqlite");
  const writer = new SnapshotWriter(path);
  writer.add(record);
  writer.finalize({ ...metadata(), discarded: -1 });
  expect(() => validateSnapshot(path)).toThrow("Invalid snapshot metadata");

  const sourcePath = await temporaryPath("invalid-source.sqlite");
  const sourceWriter = new SnapshotWriter(sourcePath);
  sourceWriter.add(record);
  sourceWriter.finalize(metadata());
  const database = new Database(sourcePath);
  database
    .query("UPDATE metadata SET value = ?1 WHERE key = 'source'")
    .run('{"url":42}');
  database.close();
  expect(() => validateSnapshot(sourcePath)).toThrow(
    "Invalid snapshot metadata",
  );
});
