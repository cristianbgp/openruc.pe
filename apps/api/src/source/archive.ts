import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import unzipper from "unzipper";

export interface ExtractResult {
  path: string;
  memberName: string;
  bytes: number;
}

export async function extractMainMember(
  zipPath: string,
  destinationDir: string,
): Promise<ExtractResult> {
  const archive = await unzipper.Open.file(zipPath);
  const files = archive.files.filter(
    (entry) => entry.type === "File" && entry.uncompressedSize > 0,
  );
  if (files.length === 0)
    throw new Error("ZIP archive contains no non-empty files");

  const preferred = files.filter((entry) => /\.(txt|csv)$/i.test(entry.path));
  const candidates = preferred.length > 0 ? preferred : files;
  const selected = candidates.reduce((largest, entry) =>
    entry.uncompressedSize > largest.uncompressedSize ? entry : largest,
  );
  await mkdir(destinationDir, { recursive: true });
  const destination = join(destinationDir, basename(selected.path));

  try {
    await pipeline(selected.stream(), createWriteStream(destination));
    return {
      path: destination,
      memberName: selected.path,
      bytes: selected.uncompressedSize,
    };
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  }
}
