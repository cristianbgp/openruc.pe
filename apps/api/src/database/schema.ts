import { z } from "zod";
import type { SnapshotMetadata } from "../padron/types";

export const SCHEMA_VERSION = 1;
export const PIPELINE_VERSION = "v3|sqlite|dom=90";

export const CREATE_SCHEMA_SQL = `
CREATE TABLE ruc (
  ruc TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  estado INTEGER NOT NULL,
  condicion INTEGER NOT NULL,
  ubigeo TEXT,
  domicilio TEXT
) WITHOUT ROWID;

CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;
`;

const sourceSignatureSchema = z.object({
  url: z.string().min(1),
  etag: z.string().nullable(),
  lastModified: z.string().nullable(),
  contentLength: z.number().int().nonnegative().nullable(),
  sha256: z.string().min(1).optional(),
});

const snapshotMetadataSchema = z.object({
  schemaVersion: z.number().int().nonnegative(),
  pipelineVersion: z.string().min(1),
  snapshot: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  generatedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  source: sourceSignatureSchema,
  records: z.number().int().nonnegative(),
  discarded: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
});

export function metadataEntries(
  metadata: SnapshotMetadata,
): [string, string][] {
  return [
    ["schema_version", String(metadata.schemaVersion)],
    ["pipeline_version", metadata.pipelineVersion],
    ["snapshot", metadata.snapshot],
    ["generated_at", metadata.generatedAt],
    ["source", JSON.stringify(metadata.source)],
    ["records", String(metadata.records)],
    ["discarded", String(metadata.discarded)],
    ["duplicates", String(metadata.duplicates)],
  ];
}

export function parseMetadata(
  entries: ReadonlyMap<string, string>,
): SnapshotMetadata {
  const required = (key: string): string => {
    const value = entries.get(key);
    if (value === undefined) throw new Error(`Missing metadata key: ${key}`);
    return value;
  };

  try {
    const parsed = snapshotMetadataSchema.parse({
      schemaVersion: Number(required("schema_version")),
      pipelineVersion: required("pipeline_version"),
      snapshot: required("snapshot"),
      generatedAt: required("generated_at"),
      source: JSON.parse(required("source")),
      records: Number(required("records")),
      discarded: Number(required("discarded")),
      duplicates: Number(required("duplicates")),
    });
    return {
      ...parsed,
      source: {
        url: parsed.source.url,
        etag: parsed.source.etag,
        lastModified: parsed.source.lastModified,
        contentLength: parsed.source.contentLength,
        ...(parsed.source.sha256 === undefined
          ? {}
          : { sha256: parsed.source.sha256 }),
      },
    };
  } catch (error) {
    throw new Error("Invalid snapshot metadata", { cause: error });
  }
}
