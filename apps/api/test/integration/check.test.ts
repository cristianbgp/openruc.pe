import { expect, test } from "bun:test";
import { shouldBuild } from "../../src/cli/check";
import type { SnapshotMetadata, SourceSignature } from "../../src/padron/types";

const current: SourceSignature = {
  url: "https://sunat.test/padron.zip",
  etag: "v1",
  lastModified: "Wed, 19 Aug 2026 12:00:00 GMT",
  contentLength: 123,
};
const previous: SnapshotMetadata = {
  schemaVersion: 1,
  pipelineVersion: "pipeline-v1",
  snapshot: "2026-08-19",
  generatedAt: "2026-08-20T00:00:00.000Z",
  source: current,
  records: 2,
  discarded: 0,
  duplicates: 0,
};

test("skips an unchanged source and pipeline", () => {
  expect(shouldBuild(current, previous, "pipeline-v1", false)).toBe(false);
});

test("ignores a prior SHA because discovery cannot observe it cheaply", () => {
  const previousWithHash = {
    ...previous,
    source: { ...current, sha256: "downloaded-hash" },
  };
  expect(shouldBuild(current, previousWithHash, "pipeline-v1", false)).toBe(
    false,
  );
});

test("builds for source, pipeline, missing-metadata, or force changes", () => {
  expect(
    shouldBuild({ ...current, etag: "v2" }, previous, "pipeline-v1", false),
  ).toBe(true);
  expect(shouldBuild(current, null, "pipeline-v1", false)).toBe(true);
  expect(shouldBuild(current, previous, "pipeline-v2", false)).toBe(true);
  expect(shouldBuild(current, previous, "pipeline-v1", true)).toBe(true);
});
