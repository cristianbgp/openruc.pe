import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AppConfig } from "../config";
import { loadConfig } from "../config";
import { SnapshotWriter } from "../database/importer";
import { PIPELINE_VERSION, SCHEMA_VERSION } from "../database/schema";
import { validateSnapshot } from "../database/validate";
import { buildHeaderIndex } from "../padron/headers";
import { cleanText, parsePadronRow } from "../padron/parser";
import type { SnapshotMetadata, SourceSignature } from "../padron/types";
import { extractMainMember } from "../source/archive";
import { type Fetcher, resolveSource } from "../source/discover";
import { downloadSource } from "../source/download";
import { readLines } from "../source/lines";

export interface BuildSnapshotOptions {
  config: AppConfig;
  targetPath: string;
  workDir: string;
  localZipPath?: string;
  limit?: number;
  fetcher?: Fetcher;
  now?: () => Date;
  log?: (message: string) => void;
}

function countUnknown(values: Map<string, number>, value: string): void {
  const key = value || "(blank)";
  if (values.has(key) || values.size < 20) {
    values.set(key, (values.get(key) ?? 0) + 1);
  } else {
    values.set("(other)", (values.get("(other)") ?? 0) + 1);
  }
}

async function hashLocalFile(
  path: string,
): Promise<{ bytes: number; sha256: string }> {
  const file = Bun.file(path);
  const hasher = new Bun.CryptoHasher("sha256");
  const reader = file.stream().getReader();
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    hasher.update(result.value);
  }
  return { bytes: file.size, sha256: hasher.digest("hex") };
}

export async function buildSnapshot(
  options: BuildSnapshotOptions,
): Promise<SnapshotMetadata> {
  const now = options.now ?? (() => new Date());
  const candidatePath = `${options.targetPath}.next`;
  const extractionDir = join(options.workDir, "extracted");
  const downloadedZip = join(options.workDir, "source.zip");
  let writer: SnapshotWriter | undefined;
  let removeDownloadedZip = false;

  await mkdir(dirname(options.targetPath), { recursive: true });
  await mkdir(options.workDir, { recursive: true });
  await rm(candidatePath, { force: true });
  await rm(extractionDir, { recursive: true, force: true });

  try {
    let zipPath: string;
    let source: SourceSignature;
    if (options.localZipPath) {
      zipPath = options.localZipPath;
      const local = await hashLocalFile(zipPath);
      source = {
        url: zipPath,
        etag: null,
        lastModified: null,
        contentLength: local.bytes,
        sha256: local.sha256,
      };
    } else {
      const discovered = await resolveSource(
        options.config.source,
        options.fetcher,
      );
      const downloaded = await downloadSource({
        signature: discovered,
        destination: downloadedZip,
        ...(options.fetcher ? { fetcher: options.fetcher } : {}),
      });
      zipPath = downloaded.path;
      removeDownloadedZip = true;
      source = { ...discovered, sha256: downloaded.sha256 };
    }

    const extracted = await extractMainMember(zipPath, extractionDir);
    const lines = readLines(extracted.path, options.config.source.encoding);
    const first = await lines.next();
    if (first.done) throw new Error("Extracted SUNAT file is empty");
    const index = buildHeaderIndex(
      first.value.split(options.config.source.delimiter),
    );
    writer = new SnapshotWriter(
      candidatePath,
      options.config.dataset.batchSize,
    );

    let records = 0;
    let discarded = 0;
    let duplicates = 0;
    let processed = 0;
    const unknownEstados = new Map<string, number>();
    const unknownCondiciones = new Map<string, number>();
    for await (const line of lines) {
      if (options.limit !== undefined && processed >= options.limit) break;
      processed += 1;
      const record = parsePadronRow(line, index, {
        delimiter: options.config.source.delimiter,
        maxNombreChars: options.config.dataset.maxNombreChars,
        maxDomicilioChars: options.config.dataset.maxDomicilioChars,
      });
      if (!record) {
        discarded += 1;
      } else if (writer.add(record) === "duplicate") {
        duplicates += 1;
      } else {
        records += 1;
      }
      if (record) {
        const fields = line.split(options.config.source.delimiter);
        if (record.estado === 255) {
          countUnknown(
            unknownEstados,
            cleanText(fields[index.estado] ?? "").toUpperCase(),
          );
        }
        if (record.condicion === 255) {
          countUnknown(
            unknownCondiciones,
            cleanText(fields[index.condicion] ?? "").toUpperCase(),
          );
        }
      }
    }

    const log = options.log ?? console.warn;
    if (unknownEstados.size > 0) {
      log(
        `Unknown estado values: ${JSON.stringify(Object.fromEntries(unknownEstados))}`,
      );
    }
    if (unknownCondiciones.size > 0) {
      log(
        `Unknown condicion values: ${JSON.stringify(Object.fromEntries(unknownCondiciones))}`,
      );
    }

    const generated = now();
    const metadata: SnapshotMetadata = {
      schemaVersion: SCHEMA_VERSION,
      pipelineVersion: PIPELINE_VERSION,
      snapshot: generated.toISOString().slice(0, 10),
      generatedAt: generated.toISOString(),
      source,
      records,
      discarded,
      duplicates,
    };
    writer.finalize(metadata);
    writer = undefined;
    validateSnapshot(candidatePath);
    await rename(candidatePath, options.targetPath);
    return metadata;
  } catch (error) {
    writer?.abort();
    await rm(candidatePath, { force: true });
    throw error;
  } finally {
    await rm(extractionDir, { recursive: true, force: true });
    if (removeDownloadedZip) await rm(downloadedZip, { force: true });
  }
}

interface CliOptions {
  localZipPath?: string;
  targetPath?: string;
  workDir?: string;
  limit?: number;
}

function parseCliOptions(arguments_: string[]): CliOptions {
  const result: CliOptions = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const value = arguments_[index + 1];
    if (argument === "--force-download") continue;
    if (!value) throw new Error(`Missing value for ${argument}`);
    if (argument === "--local-zip") result.localZipPath = value;
    else if (argument === "--target") result.targetPath = value;
    else if (argument === "--work-dir") result.workDir = value;
    else if (argument === "--limit") result.limit = Number(value);
    else throw new Error(`Unknown argument: ${argument}`);
    index += 1;
  }
  return result;
}

if (import.meta.main) {
  const config = await loadConfig();
  const cli = parseCliOptions(process.argv.slice(2));
  const metadata = await buildSnapshot({
    config,
    targetPath: cli.targetPath ?? config.databasePath,
    workDir: cli.workDir ?? ".work",
    ...(cli.localZipPath ? { localZipPath: cli.localZipPath } : {}),
    ...(cli.limit === undefined ? {} : { limit: cli.limit }),
  });
  console.log(JSON.stringify(metadata, null, 2));
}
