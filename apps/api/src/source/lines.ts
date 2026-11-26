import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import iconv from "iconv-lite";

export async function* readLines(
  path: string,
  encoding: string,
): AsyncGenerator<string> {
  const source = createReadStream(path);
  const decoder = iconv.decodeStream(encoding);
  const lines = createInterface({
    input: source.pipe(decoder),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  try {
    for await (const line of lines) yield line;
  } finally {
    lines.close();
    source.destroy();
    decoder.end();
  }
}
