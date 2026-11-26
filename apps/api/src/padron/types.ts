export interface PadronRecord {
  ruc: string;
  nombre: string;
  estado: number;
  condicion: number;
  ubigeo: string | null;
  domicilio: string | null;
}

export interface SourceSignature {
  url: string;
  etag: string | null;
  lastModified: string | null;
  contentLength: number | null;
  sha256?: string;
}

export interface SnapshotMetadata {
  schemaVersion: number;
  pipelineVersion: string;
  snapshot: string;
  generatedAt: string;
  source: SourceSignature;
  records: number;
  discarded: number;
  duplicates: number;
}
