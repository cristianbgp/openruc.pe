import { readFile } from "node:fs/promises";
import { z } from "zod";

export interface AppConfig {
  source: {
    listingUrl: string;
    fallbackZipUrls: string[];
    encoding: string;
    delimiter: string;
  };
  dataset: {
    maxNombreChars: number;
    maxDomicilioChars: number;
    batchSize: number;
  };
  api: { corsOrigins: string[]; rateLimit: number; rateWindowMs: number };
  databasePath: string;
  port: number;
}

const positiveInteger = z.number().int().min(1);
const fileSchema = z.object({
  source: z.object({
    listing_url: z.url(),
    fallback_zip_urls: z.array(z.url()),
    encoding: z.string().min(1),
    delimiter: z.string().min(1),
  }),
  dataset: z.object({
    max_nombre_chars: positiveInteger,
    max_domicilio_chars: positiveInteger,
    batch_size: positiveInteger,
  }),
  api: z.object({
    cors_origins: z.array(z.string().min(1)).min(1),
    rate_limit: positiveInteger,
    rate_window_ms: positiveInteger,
  }),
});
const portSchema = z.number().int().min(1).max(65_535);

function environmentNumber(
  value: string | undefined,
  fallback: number,
): number {
  return value === undefined ? fallback : Number(value);
}

export async function loadConfig(path = "config.json"): Promise<AppConfig> {
  const raw = fileSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const corsOrigins = process.env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    source: {
      listingUrl: raw.source.listing_url,
      fallbackZipUrls: raw.source.fallback_zip_urls,
      encoding: raw.source.encoding,
      delimiter: raw.source.delimiter,
    },
    dataset: {
      maxNombreChars: raw.dataset.max_nombre_chars,
      maxDomicilioChars: raw.dataset.max_domicilio_chars,
      batchSize: raw.dataset.batch_size,
    },
    api: {
      corsOrigins: z
        .array(z.string().min(1))
        .min(1)
        .parse(corsOrigins ?? raw.api.cors_origins),
      rateLimit: positiveInteger.parse(
        environmentNumber(process.env.RATE_LIMIT, raw.api.rate_limit),
      ),
      rateWindowMs: positiveInteger.parse(
        environmentNumber(process.env.RATE_WINDOW_MS, raw.api.rate_window_ms),
      ),
    },
    databasePath: process.env.DATABASE_PATH ?? "data/padron.sqlite",
    port: portSchema.parse(environmentNumber(process.env.PORT, 3000)),
  };
}
