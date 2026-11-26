import { expect, test } from "bun:test";
import { createApp } from "../../src/api/app";
import {
  createFixedWindowLimiter,
  type RequestLog,
} from "../../src/api/middleware";
import { PIPELINE_VERSION } from "../../src/database/schema";

const metadata = {
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
};

test("enforces fixed windows and prunes expired clients", () => {
  let now = 1_000;
  const limiter = createFixedWindowLimiter({
    limit: 2,
    windowMs: 1_000,
    now: () => now,
  });
  expect(limiter.check("client").allowed).toBe(true);
  expect(limiter.check("client").allowed).toBe(true);
  expect(limiter.check("client").allowed).toBe(false);
  expect(limiter.size()).toBe(1);
  now = 2_001;
  expect(limiter.check("other").allowed).toBe(true);
  expect(limiter.size()).toBe(1);
  expect(limiter.check("client").allowed).toBe(true);
});

test("caps limiter state under a flood of unique clients", () => {
  const limiter = createFixedWindowLimiter({
    limit: 2,
    windowMs: 60_000,
    maxEntries: 3,
  });
  for (const client of ["one", "two", "three", "four", "five"])
    limiter.check(client);
  expect(limiter.size()).toBe(3);
});

test("preserves safe request IDs and replaces oversized values", async () => {
  let generated = 0;
  const app = createApp({
    repository: {
      lookup: () => null,
      metadata: () => metadata,
      isReady: () => true,
    },
    requestId: () => `generated-${++generated}`,
  });

  const safe = await app.request("/health", {
    headers: { "X-Request-ID": "client-safe_1" },
  });
  expect(safe.headers.get("X-Request-ID")).toBe("client-safe_1");
  const oversized = await app.request("/health", {
    headers: { "X-Request-ID": "x".repeat(129) },
  });
  expect(oversized.headers.get("X-Request-ID")).toBe("generated-1");
});

test("rate limits by hashed client and exempts health", async () => {
  const app = createApp({
    repository: {
      lookup: () => null,
      metadata: () => metadata,
      isReady: () => true,
    },
    requestId: () => "req-test",
    rateLimit: 1,
    rateWindowMs: 10_000,
  });
  const headers = { "X-Real-IP": "203.0.113.45" };

  expect((await app.request("/v1/meta", { headers })).status).toBe(200);
  const limited = await app.request("/v1/meta", { headers });
  expect(limited.status).toBe(429);
  expect(limited.headers.get("Retry-After")).toBe("10");
  expect((await limited.json()).error.code).toBe("RATE_LIMITED");
  expect((await app.request("/health", { headers })).status).toBe(200);
});

test("uses Railway's client header instead of a spoofable forwarded chain", async () => {
  const app = createApp({
    repository: {
      lookup: () => null,
      metadata: () => metadata,
      isReady: () => true,
    },
    requestId: () => "req-test",
    rateLimit: 1,
    rateWindowMs: 10_000,
    log: () => undefined,
  });
  const spoofed = "198.51.100.10";
  expect(
    (
      await app.request("/v1/meta", {
        headers: { "X-Real-IP": "203.0.113.1", "X-Forwarded-For": spoofed },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request("/v1/meta", {
        headers: { "X-Real-IP": "203.0.113.2", "X-Forwarded-For": spoofed },
      })
    ).status,
  ).toBe(200);
});

test("supports wildcard CORS and observes preflight requests", async () => {
  const logs: RequestLog[] = [];
  const app = createApp({
    repository: {
      lookup: () => null,
      metadata: () => metadata,
      isReady: () => true,
    },
    requestId: () => "req-preflight",
    corsOrigins: ["*"],
    log: (entry) => logs.push(entry),
  });
  const response = await app.request("/v1/meta", {
    method: "OPTIONS",
    headers: {
      Origin: "https://example.test",
      "Access-Control-Request-Method": "GET",
    },
  });
  expect(response.status).toBe(204);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(response.headers.get("X-Request-ID")).toBe("req-preflight");
  expect(logs).toHaveLength(1);
  expect(logs[0]?.method).toBe("OPTIONS");
});

test("logs route metadata without records or full client addresses", async () => {
  const logs: RequestLog[] = [];
  const app = createApp({
    repository: {
      lookup: () => ({
        ruc: "20100047218",
        nombre: "SECRET COMPANY NAME",
        estado: 0,
        condicion: 0,
        ubigeo: null,
        domicilio: null,
      }),
      metadata: () => metadata,
      isReady: () => true,
    },
    requestId: () => "req-log",
    log: (entry) => logs.push(entry),
    now: (() => {
      let value = 100;
      return () => value++;
    })(),
  });

  await app.request("/v1/ruc/20100047218", {
    headers: { "X-Real-IP": "203.0.113.45" },
  });

  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({
    requestId: "req-log",
    method: "GET",
    route: "/v1/ruc/:ruc",
    status: 200,
    durationMs: 1,
    errorCode: null,
  });
  const serialized = JSON.stringify(logs[0]);
  expect(serialized).not.toContain("SECRET COMPANY NAME");
  expect(serialized).not.toContain("203.0.113.45");
  expect(logs[0]).not.toHaveProperty("clientHash");
});
