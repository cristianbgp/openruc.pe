import { z } from "@hono/zod-openapi";

export const SourceSignatureSchema = z
  .object({
    url: z.string(),
    etag: z.string().nullable(),
    lastModified: z.string().nullable(),
    contentLength: z.number().int().nullable(),
    sha256: z.string().optional(),
  })
  .openapi("SourceSignature");

export const MetadataSchema = z
  .object({
    schemaVersion: z.number().int(),
    pipelineVersion: z.string(),
    snapshot: z.string(),
    generatedAt: z.string(),
    source: SourceSignatureSchema,
    records: z.number().int(),
    discarded: z.number().int(),
    duplicates: z.number().int(),
  })
  .openapi("SnapshotMetadata");

export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.enum([
        "INVALID_RUC",
        "RUC_NOT_FOUND",
        "RATE_LIMITED",
        "DATABASE_UNAVAILABLE",
        "INTERNAL_ERROR",
      ]),
      message: z.string(),
      requestId: z.string(),
    }),
  })
  .openapi("ApiError");

export const OPENAPI_DOCUMENT = {
  openapi: "3.1.0" as const,
  info: {
    title: "openruc.pe",
    version: "1.0.0",
    description:
      "Read-only exact RUC lookups from an immutable SUNAT snapshot.",
  },
};

export function jsonContent(schema: z.ZodType) {
  return { content: { "application/json": { schema } } };
}
