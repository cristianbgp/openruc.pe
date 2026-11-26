import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { SourceSignature } from "../padron/types";

export interface DownloadResult {
  path: string;
  bytes: number;
  sha256: string;
}

export type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface DestinationWriter {
  write(chunk: Uint8Array): number;
  end(): number | Promise<number> | Promise<void>;
}

export async function downloadSource(options: {
  signature: SourceSignature;
  destination: string;
  fetcher?: Fetcher;
  writerFactory?: (destination: string) => DestinationWriter;
}): Promise<DownloadResult> {
  const fetcher = options.fetcher ?? fetch;
  await mkdir(dirname(options.destination), { recursive: true });
  const writer =
    options.writerFactory?.(options.destination) ??
    Bun.file(options.destination).writer();
  let bytes = 0;
  let writerEnded = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const closeWriter = async (): Promise<void> => {
    if (writerEnded) return;
    writerEnded = true;
    await writer.end();
  };

  try {
    const response = await fetcher(options.signature.url);
    if (!response.ok || !response.body)
      throw new Error(`Download failed with HTTP ${response.status}`);
    reader = response.body.getReader();
    const hasher = new Bun.CryptoHasher("sha256");

    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      hasher.update(result.value);
      writer.write(result.value);
    }
    await closeWriter();

    if (
      options.signature.contentLength !== null &&
      bytes !== options.signature.contentLength
    ) {
      throw new Error(
        `Content length mismatch: expected ${options.signature.contentLength}, received ${bytes}`,
      );
    }
    return { path: options.destination, bytes, sha256: hasher.digest("hex") };
  } catch (error) {
    await reader?.cancel().catch(() => undefined);
    await closeWriter().catch(() => undefined);
    await rm(options.destination, { force: true });
    throw error;
  }
}
