import type { SourceSignature } from "../padron/types";

export interface SourceDiscoveryConfig {
  listingUrl: string;
  fallbackZipUrls: string[];
}

export type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const USER_AGENT = "openrucpe/0.1";
const ZIP_LINK = /href\s*=\s*["']([^"']+\.zip)["']/giu;

function cleanEtag(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/^W\//i, "").replace(/^"|"$/g, "") || null;
}

function positiveLength(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  return Number(value);
}

async function signature(
  url: string,
  fetcher: Fetcher,
): Promise<SourceSignature> {
  let response = await fetcher(url, {
    method: "HEAD",
    headers: { "User-Agent": USER_AGENT },
  });
  let contentLength: number | null;

  if (response.ok) {
    contentLength = positiveLength(response.headers.get("Content-Length"));
  } else {
    response = await fetcher(url, {
      method: "GET",
      headers: { Range: "bytes=0-0", "User-Agent": USER_AGENT },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentRange = response.headers.get("Content-Range");
    contentLength = positiveLength(contentRange?.split("/").at(-1) ?? null);
    if (contentLength === null)
      contentLength = positiveLength(response.headers.get("Content-Length"));
    await response.body?.cancel();
  }

  return {
    url,
    etag: cleanEtag(response.headers.get("ETag")),
    lastModified: response.headers.get("Last-Modified"),
    contentLength,
  };
}

async function candidates(
  config: SourceDiscoveryConfig,
  fetcher: Fetcher,
): Promise<string[]> {
  const discovered: string[] = [];
  if (config.listingUrl) {
    try {
      const response = await fetcher(config.listingUrl, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      for (const match of html.matchAll(ZIP_LINK)) {
        const href = match[1];
        if (!href) continue;
        const url = new URL(href, config.listingUrl).toString();
        if (!url.toLowerCase().includes("anexo")) discovered.push(url);
      }
    } catch {
      // Configured fallbacks remain usable when SUNAT's listing page is unavailable.
    }
  }
  return [...new Set([...discovered, ...config.fallbackZipUrls])];
}

export async function resolveSource(
  config: SourceDiscoveryConfig,
  fetcher: Fetcher = fetch,
): Promise<SourceSignature> {
  const errors: string[] = [];
  for (const url of await candidates(config, fetcher)) {
    try {
      return await signature(url, fetcher);
    } catch (error) {
      errors.push(
        `${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw new Error(
    `No usable SUNAT ZIP source${errors.length ? `:\n${errors.join("\n")}` : ""}`,
  );
}
