import { Database } from "bun:sqlite";
import type { PadronRecord, SnapshotMetadata } from "../padron/types";
import { validateSnapshot } from "./validate";

export class SqlitePadronRepository {
  readonly #database: Database;
  readonly #lookup;
  readonly #snapshotMetadata: SnapshotMetadata;
  #ready = true;

  private constructor(path: string, metadata: SnapshotMetadata) {
    this.#snapshotMetadata = metadata;
    this.#database = new Database(path, { readonly: true, strict: true });
    this.#lookup = this.#database.prepare<PadronRecord, [string]>(`
      SELECT ruc, nombre, estado, condicion, ubigeo, domicilio
      FROM ruc
      WHERE ruc = ?1
    `);
  }

  static open(path: string): SqlitePadronRepository {
    return new SqlitePadronRepository(path, validateSnapshot(path));
  }

  lookup(ruc: string): PadronRecord | null {
    this.#assertReady();
    return this.#lookup.get(ruc);
  }

  metadata(): SnapshotMetadata {
    this.#assertReady();
    return structuredClone(this.#snapshotMetadata);
  }

  isReady(): boolean {
    return this.#ready;
  }

  close(): void {
    if (!this.#ready) return;
    this.#ready = false;
    this.#lookup.finalize();
    this.#database.close();
  }

  #assertReady(): void {
    if (!this.#ready) throw new Error("Repository is closed");
  }
}
