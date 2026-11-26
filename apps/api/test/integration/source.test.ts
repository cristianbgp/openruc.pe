import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { extractMainMember } from "../../src/source/archive";
import { downloadSource } from "../../src/source/download";

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ruc-source-"));
  directories.push(directory);
  return directory;
}

test("extracts the largest TXT or CSV member", async () => {
  const directory = await temporaryDirectory();
  const zipPath = join(directory, "source.zip");
  await Bun.write(
    zipPath,
    zipSync({
      "readme.txt": strToU8("small"),
      "nested/padron.txt": strToU8(
        "RUC|RAZON SOCIAL\n20100047218|BANCO DE CREDITO DEL PERU",
      ),
      "ignored.bin": new Uint8Array(500),
    }),
  );

  const result = await extractMainMember(zipPath, join(directory, "extracted"));

  expect(result.memberName).toBe("nested/padron.txt");
  expect(await readFile(result.path, "utf8")).toContain("20100047218");
});

test("streams a download and returns its byte count and SHA-256", async () => {
  const directory = await temporaryDirectory();
  const destination = join(directory, "source.zip");
  const chunks = [
    new TextEncoder().encode("hello "),
    new TextEncoder().encode("world"),
  ];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

  const result = await downloadSource({
    signature: {
      url: "https://sunat.test/source.zip",
      etag: null,
      lastModified: null,
      contentLength: 11,
    },
    destination,
    fetcher: async () => new Response(body, { status: 200 }),
  });

  expect(result.bytes).toBe(11);
  expect(result.sha256).toBe(
    "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
  );
  expect(await readFile(destination, "utf8")).toBe("hello world");
});

test("removes a partial download when content length does not match", async () => {
  const directory = await temporaryDirectory();
  const destination = join(directory, "partial.zip");

  await expect(
    downloadSource({
      signature: {
        url: "https://sunat.test/source.zip",
        etag: null,
        lastModified: null,
        contentLength: 10,
      },
      destination,
      fetcher: async () => new Response("short", { status: 200 }),
    }),
  ).rejects.toThrow("Content length mismatch");
  expect(await Bun.file(destination).exists()).toBe(false);
});

test("waits for the destination writer to finish flushing", async () => {
  const directory = await temporaryDirectory();
  let release: (() => void) | undefined;
  let finished = false;
  const flushing = new Promise<void>((resolve) => {
    release = () => {
      finished = true;
      resolve();
    };
  });
  const downloading = downloadSource({
    signature: {
      url: "https://sunat.test/source.zip",
      etag: null,
      lastModified: null,
      contentLength: 4,
    },
    destination: join(directory, "delayed.zip"),
    fetcher: async () => new Response("data"),
    writerFactory: () => ({ write: () => 4, end: () => flushing }),
  });
  await Bun.sleep(0);
  expect(finished).toBe(false);
  let settled = false;
  void downloading.then(() => {
    settled = true;
  });
  await Bun.sleep(0);
  expect(settled).toBe(false);
  release?.();
  await downloading;
  expect(settled).toBe(true);
});
