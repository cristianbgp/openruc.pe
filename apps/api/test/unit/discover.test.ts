import { expect, test } from "bun:test";
import { resolveSource } from "../../src/source/discover";

test("discovers a non-anexo ZIP and reads its HEAD signature", async () => {
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("listing.html")) {
      return new Response(
        '<a href="padron.zip">P</a><a href="anexo.zip">A</a>',
      );
    }
    if (init?.method === "HEAD") {
      return new Response(null, {
        headers: {
          ETag: '"v1"',
          "Content-Length": "123",
          "Last-Modified": "Wed, 19 Aug 2026 12:00:00 GMT",
        },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const result = await resolveSource(
    { listingUrl: "https://sunat.test/listing.html", fallbackZipUrls: [] },
    fetcher,
  );

  expect(result).toEqual({
    url: "https://sunat.test/padron.zip",
    etag: "v1",
    lastModified: "Wed, 19 Aug 2026 12:00:00 GMT",
    contentLength: 123,
  });
});

test("falls back from a rejected HEAD to a one-byte Range request", async () => {
  const methods: string[] = [];
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
    methods.push(init?.method ?? "GET");
    if (init?.method === "HEAD") return new Response(null, { status: 405 });
    expect(new Headers(init?.headers).get("Range")).toBe("bytes=0-0");
    return new Response(new Uint8Array([1]), {
      status: 206,
      headers: { "Content-Range": "bytes 0-0/456", ETag: 'W/"v2"' },
    });
  };

  const result = await resolveSource(
    { listingUrl: "", fallbackZipUrls: ["https://sunat.test/fallback.zip"] },
    fetcher,
  );

  expect(methods).toEqual(["HEAD", "GET"]);
  expect(result).toMatchObject({ etag: "v2", contentLength: 456 });
});

test("tries fallback URLs in order and reports complete failure", async () => {
  const requested: string[] = [];
  const fetcher = async (input: RequestInfo | URL) => {
    requested.push(String(input));
    return new Response(null, { status: 503 });
  };

  await expect(
    resolveSource(
      {
        listingUrl: "",
        fallbackZipUrls: [
          "https://sunat.test/first.zip",
          "https://sunat.test/second.zip",
        ],
      },
      fetcher,
    ),
  ).rejects.toThrow("No usable SUNAT ZIP source");
  expect(requested).toEqual([
    "https://sunat.test/first.zip",
    "https://sunat.test/first.zip",
    "https://sunat.test/second.zip",
    "https://sunat.test/second.zip",
  ]);
});
