import { appendFile } from "node:fs/promises";
import { loadConfig } from "../config";
import { PIPELINE_VERSION } from "../database/schema";
import type { SnapshotMetadata, SourceSignature } from "../padron/types";
import { resolveSource } from "../source/discover";

export function shouldBuild(
  current: SourceSignature,
  previous: SnapshotMetadata | null,
  pipelineVersion: string,
  force: boolean,
): boolean {
  if (force || !previous || previous.pipelineVersion !== pipelineVersion)
    return true;
  const fields: (keyof SourceSignature)[] = [
    "url",
    "etag",
    "lastModified",
    "contentLength",
  ];
  return fields.some((field) => current[field] !== previous.source[field]);
}

async function previousMetadata(
  baseUrl: string | undefined,
): Promise<SnapshotMetadata | null> {
  if (!baseUrl) return null;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/meta`);
    if (!response.ok) return null;
    const body = (await response.json()) as
      | SnapshotMetadata
      | { data: SnapshotMetadata };
    return "data" in body ? body.data : body;
  } catch {
    return null;
  }
}

if (import.meta.main) {
  const config = await loadConfig();
  const current = await resolveSource(config.source);
  const previous = await previousMetadata(process.env.PUBLISHED_API_URL);
  const build = shouldBuild(
    current,
    previous,
    PIPELINE_VERSION,
    process.argv.includes("--force"),
  );
  console.log(
    JSON.stringify(
      { current, previous: previous?.source ?? null, shouldBuild: build },
      null,
      2,
    ),
  );

  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    await appendFile(
      output,
      [
        `should_build=${build}`,
        `source_url=${current.url}`,
        `etag=${current.etag ?? ""}`,
        `last_modified=${current.lastModified ?? ""}`,
        "",
      ].join("\n"),
    );
  }
}
