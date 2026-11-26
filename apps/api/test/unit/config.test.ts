import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config";

const directories: string[] = [];
const environmentKeys = [
  "DATABASE_PATH",
  "PORT",
  "CORS_ORIGINS",
  "RATE_LIMIT",
  "RATE_WINDOW_MS",
] as const;
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
);

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
  for (const key of environmentKeys) {
    const original = originalEnvironment[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
});

async function configFile(
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ruc-config-"));
  directories.push(directory);
  const path = join(directory, "config.json");
  await writeFile(
    path,
    JSON.stringify({
      source: {
        listing_url: "https://sunat.test/listing.html",
        fallback_zip_urls: ["https://sunat.test/fallback.zip"],
        encoding: "win1252",
        delimiter: "|",
      },
      dataset: {
        max_nombre_chars: 120,
        max_domicilio_chars: 90,
        batch_size: 10_000,
      },
      api: { cors_origins: ["*"], rate_limit: 120, rate_window_ms: 60_000 },
      ...overrides,
    }),
  );
  return path;
}

test("loads snake-case JSON and applies environment overrides", async () => {
  process.env.DATABASE_PATH = "/tmp/custom.sqlite";
  process.env.PORT = "4321";
  process.env.CORS_ORIGINS = "https://one.test, https://two.test";
  process.env.RATE_LIMIT = "25";
  process.env.RATE_WINDOW_MS = "5000";

  const config = await loadConfig(await configFile());

  expect(config).toEqual({
    source: {
      listingUrl: "https://sunat.test/listing.html",
      fallbackZipUrls: ["https://sunat.test/fallback.zip"],
      encoding: "win1252",
      delimiter: "|",
    },
    dataset: { maxNombreChars: 120, maxDomicilioChars: 90, batchSize: 10_000 },
    api: {
      corsOrigins: ["https://one.test", "https://two.test"],
      rateLimit: 25,
      rateWindowMs: 5000,
    },
    databasePath: "/tmp/custom.sqlite",
    port: 4321,
  });
});

test("rejects invalid ports, delimiters, and numeric settings", async () => {
  process.env.PORT = "70000";
  await expect(loadConfig(await configFile())).rejects.toThrow();
  delete process.env.PORT;

  const emptyDelimiter = await configFile({
    source: {
      listing_url: "https://sunat.test/listing.html",
      fallback_zip_urls: [],
      encoding: "win1252",
      delimiter: "",
    },
  });
  await expect(loadConfig(emptyDelimiter)).rejects.toThrow();

  process.env.RATE_LIMIT = "0";
  await expect(loadConfig(await configFile())).rejects.toThrow();
});
