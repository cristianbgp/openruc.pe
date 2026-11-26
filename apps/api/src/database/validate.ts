import { Database } from "bun:sqlite";
import type { SnapshotMetadata } from "../padron/types";
import { parseMetadata, SCHEMA_VERSION } from "./schema";

interface IntegrityRow {
  integrity_check: string;
}

interface CountRow {
  count: number;
}

interface MetadataRow {
  key: string;
  value: string;
}

export function validateSnapshot(path: string): SnapshotMetadata {
  const database = new Database(path, { readonly: true, strict: true });
  try {
    const integrity = database
      .query<IntegrityRow, []>("PRAGMA integrity_check")
      .get();
    if (integrity?.integrity_check !== "ok") {
      throw new Error(
        `SQLite integrity check failed: ${integrity?.integrity_check ?? "no result"}`,
      );
    }

    const rows = database
      .query<MetadataRow, []>("SELECT key, value FROM metadata")
      .all();
    const metadata = parseMetadata(
      new Map(rows.map(({ key, value }) => [key, value])),
    );

    if (metadata.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`Unsupported schema version: ${metadata.schemaVersion}`);
    }
    if (metadata.records < 1) throw new Error("Snapshot has no records");

    const actual = database
      .query<CountRow, []>("SELECT COUNT(*) AS count FROM ruc")
      .get()?.count;
    if (actual !== metadata.records) {
      throw new Error(
        `Metadata record count ${metadata.records} does not match SQLite count ${actual ?? "unknown"}`,
      );
    }
    return metadata;
  } finally {
    database.close();
  }
}
