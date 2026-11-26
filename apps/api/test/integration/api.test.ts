import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/api/app";
import { SnapshotWriter } from "../../src/database/importer";
import { SqlitePadronRepository } from "../../src/database/repository";
import { PIPELINE_VERSION, SCHEMA_VERSION } from "../../src/database/schema";
import { rucCheckDigit } from "../../src/padron/ruc";

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function fixtureRepository(
  lastModified: string | null = "Tue, 18 Aug 2026 06:35:00 GMT",
): Promise<SqlitePadronRepository> {
  const directory = await mkdtemp(join(tmpdir(), "ruc-api-"));
  directories.push(directory);
  const path = join(directory, "padron.sqlite");
  const writer = new SnapshotWriter(path);
  writer.add({
    ruc: "20100047218",
    nombre: "BANCO DE CREDITO DEL PERU",
    estado: 0,
    condicion: 0,
    ubigeo: "150114",
    domicilio: null,
  });
  writer.finalize({
    schemaVersion: SCHEMA_VERSION,
    pipelineVersion: PIPELINE_VERSION,
    snapshot: "2026-08-19",
    generatedAt: "2026-08-20T00:00:00.000Z",
    source: {
      url: "fixture.zip",
      etag: "v1",
      lastModified,
      contentLength: 123,
      sha256: "abc",
    },
    records: 1,
    discarded: 0,
    duplicates: 0,
  });
  return SqlitePadronRepository.open(path);
}

test("returns a flat RUC record with source date and snapshot cache policy", async () => {
  const repository = await fixtureRepository();
  const app = createApp({ repository, requestId: () => "req-test" });

  const response = await app.request("/v1/ruc/20100047218");

  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe(
    "public, max-age=86400, stale-while-revalidate=604800",
  );
  expect(await response.json()).toEqual({
    ruc: "20100047218",
    razon_social: "BANCO DE CREDITO DEL PERU",
    estado: "ACTIVO",
    condicion: "HABIDO",
    direccion: null,
    ubigeo: "150114",
    source: "SUNAT",
    as_of: "2026-08-18",
  });
  repository.close();
});

test.each([null, "0", "Invalid Date"])(
  "returns a null source date when Last-Modified is %p",
  async (lastModified) => {
    const repository = await fixtureRepository(lastModified);
    const app = createApp({ repository, log: () => undefined });
    try {
      const response = await app.request("/v1/ruc/20100047218");
      expect(response.status).toBe(200);
      expect((await response.json()).as_of).toBeNull();
    } finally {
      repository.close();
    }
  },
);

test("returns stable invalid and missing RUC errors without caching", async () => {
  const repository = await fixtureRepository();
  const app = createApp({ repository, requestId: () => "req-test" });

  const invalid = await app.request("/v1/ruc/20100047219");
  expect(invalid.status).toBe(400);
  expect(invalid.headers.get("Cache-Control")).toBe("no-store");
  expect(await invalid.json()).toEqual({
    error: {
      code: "INVALID_RUC",
      message: "RUC must contain eleven digits with a valid check digit.",
      requestId: "req-test",
    },
  });

  const firstTen = "2099999999";
  const missingRuc = `${firstTen}${rucCheckDigit(firstTen)}`;
  const missing = await app.request(`/v1/ruc/${missingRuc}`);
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({
    error: {
      code: "RUC_NOT_FOUND",
      message: "The requested RUC is not present in this snapshot.",
      requestId: "req-test",
    },
  });
  repository.close();
});

test("serves metadata and reports ready or unavailable health", async () => {
  const repository = await fixtureRepository();
  const app = createApp({ repository, requestId: () => "req-test" });

  const metadata = await app.request("/v1/meta");
  expect(metadata.status).toBe(200);
  expect((await metadata.json()).data.snapshot).toBe("2026-08-19");

  const ready = await app.request("/health");
  expect(ready.status).toBe(200);
  expect(await ready.json()).toEqual({
    status: "ok",
    database: "ready",
    snapshot: "2026-08-19",
  });
  repository.close();

  const unavailableApp = createApp({
    repository: {
      lookup: () => null,
      metadata: () => {
        throw new Error("database unavailable");
      },
      isReady: () => false,
    },
    requestId: () => "req-test",
  });
  const unavailable = await unavailableApp.request("/health");
  expect(unavailable.status).toBe(503);
  expect(unavailable.headers.get("Cache-Control")).toBe("no-store");
});

test("documents all public paths and serves Swagger UI", async () => {
  const repository = await fixtureRepository();
  const app = createApp({ repository, requestId: () => "req-test" });

  const document = await (await app.request("/openapi.json")).json();
  expect(Object.keys(document.paths).sort()).toEqual(
    ["/docs", "/health", "/openapi.json", "/v1/meta", "/v1/ruc/{ruc}"].sort(),
  );
  expect(
    document.paths["/v1/ruc/{ruc}"].get.responses[200].content[
      "application/json"
    ].schema,
  ).toEqual({ $ref: "#/components/schemas/RucResponse" });
  expect(
    Object.keys(document.components.schemas.RucResponse.properties).sort(),
  ).toEqual([
    "as_of",
    "condicion",
    "direccion",
    "estado",
    "razon_social",
    "ruc",
    "source",
    "ubigeo",
  ]);
  const docs = await app.request("/docs");
  expect(docs.status).toBe(200);
  expect(docs.headers.get("Content-Type")).toContain("text/html");
  expect(await docs.text()).toContain("SwaggerUIBundle");
  for (const path of ["/v1/meta", "/v1/ruc/{ruc}", "/docs", "/openapi.json"]) {
    expect(
      document.paths[path].get.responses[429].content["application/json"]
        .schema,
    ).toEqual({
      $ref: "#/components/schemas/ApiError",
    });
    expect(
      document.paths[path].get.responses[500].content["application/json"]
        .schema,
    ).toEqual({
      $ref: "#/components/schemas/ApiError",
    });
  }
  expect(
    document.paths["/health"].get.responses[500].content["application/json"]
      .schema,
  ).toEqual({
    $ref: "#/components/schemas/ApiError",
  });
  repository.close();
});

test("translates repository failures to DATABASE_UNAVAILABLE", async () => {
  const app = createApp({
    repository: {
      lookup: () => {
        throw new Error("closed");
      },
      metadata: () => ({
        schemaVersion: 1,
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
      }),
      isReady: () => true,
    },
    requestId: () => "req-test",
  });

  const response = await app.request("/v1/ruc/20100047218");
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe("DATABASE_UNAVAILABLE");
});
