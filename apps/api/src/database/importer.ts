import { Database } from "bun:sqlite";
import type { PadronRecord, SnapshotMetadata } from "../padron/types";
import { CREATE_SCHEMA_SQL, metadataEntries } from "./schema";

export class SnapshotWriter {
  readonly #database: Database;
  readonly #insertRecord;
  readonly #insertMetadata;
  readonly #batchSize: number;
  #pending = 0;
  #closed = false;

  constructor(path: string, batchSize = 10_000) {
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new RangeError("batchSize must be a positive integer");
    }

    this.#batchSize = batchSize;
    this.#database = new Database(path, { create: true, strict: true });
    this.#database.run("PRAGMA journal_mode = OFF");
    this.#database.run("PRAGMA synchronous = OFF");
    this.#database.run("PRAGMA temp_store = MEMORY");
    this.#database.exec(CREATE_SCHEMA_SQL);
    this.#insertRecord = this.#database.prepare(`
      INSERT OR IGNORE INTO ruc
        (ruc, nombre, estado, condicion, ubigeo, domicilio)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    `);
    this.#insertMetadata = this.#database.prepare(
      "INSERT INTO metadata (key, value) VALUES (?1, ?2)",
    );
    this.#database.run("BEGIN");
  }

  add(record: PadronRecord): "inserted" | "duplicate" {
    this.#assertOpen();
    const result = this.#insertRecord.run(
      record.ruc,
      record.nombre,
      record.estado,
      record.condicion,
      record.ubigeo,
      record.domicilio,
    );
    this.#pending += 1;
    if (this.#pending >= this.#batchSize) {
      this.#database.run("COMMIT");
      this.#database.run("BEGIN");
      this.#pending = 0;
    }
    return result.changes === 1 ? "inserted" : "duplicate";
  }

  finalize(metadata: SnapshotMetadata): void {
    this.#assertOpen();
    try {
      this.#database.run("COMMIT");
      this.#database.run("BEGIN");
      for (const [key, value] of metadataEntries(metadata)) {
        this.#insertMetadata.run(key, value);
      }
      this.#database.run("COMMIT");
      this.#database.run("PRAGMA optimize");
    } finally {
      this.#close();
    }
  }

  abort(): void {
    if (this.#closed) return;
    try {
      this.#database.run("ROLLBACK");
    } catch {
      // The transaction may already be committed after a finalize failure.
    } finally {
      this.#close();
    }
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("SnapshotWriter is closed");
  }

  #close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#insertRecord.finalize();
    this.#insertMetadata.finalize();
    this.#database.close();
  }
}
