import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import semanticRelease from "semantic-release";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { releasePackage } from "./releasePackage.js";

vi.mock("semantic-release", () => ({ default: vi.fn() }));

describe("release candidate reporting", () => {
  let directory;
  let output;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "cmx-release-output-"));
    output = join(directory, "output");
    await writeFile(output, "has_releases=false\n");
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ name: "@cmx-tools/contracts", version: "0.2.0" }),
    );
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    vi.stubEnv("CI_DRY_RUN", "true");
    vi.stubEnv("GITHUB_OUTPUT", output);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it("keeps publication skipped when a package has no release", async () => {
    semanticRelease.mockResolvedValue(false);

    await releasePackage();

    expect(await readFile(output, "utf8")).toBe("has_releases=false\n");
  });

  it("requests publication when an earlier package has a release", async () => {
    semanticRelease
      .mockResolvedValueOnce({ nextRelease: { version: "0.2.0" } })
      .mockResolvedValueOnce(false);

    await releasePackage();
    await releasePackage();

    expect(await readFile(output, "utf8")).toBe(
      "has_releases=false\nhas_releases=true\n",
    );
  });

  it("does not report dry-run candidates during actual publication", async () => {
    vi.stubEnv("CI_DRY_RUN", "false");
    semanticRelease.mockResolvedValue({ nextRelease: { version: "0.2.0" } });

    await releasePackage();

    expect(await readFile(output, "utf8")).toBe("has_releases=false\n");
  });

  it("supports a local dry run without a GitHub output file", async () => {
    vi.stubEnv("GITHUB_OUTPUT", undefined);
    semanticRelease.mockResolvedValue({ nextRelease: { version: "0.2.0" } });

    await expect(releasePackage()).resolves.toBeUndefined();
  });

  it("fails analysis even after another package reported a candidate", async () => {
    semanticRelease
      .mockResolvedValueOnce({ nextRelease: { version: "0.2.0" } })
      .mockRejectedValueOnce(new Error("GitHub authentication failed"));

    await releasePackage();

    await expect(releasePackage()).rejects.toThrow(
      "GitHub authentication failed",
    );
  });

  it("requests publication when an existing version needs a release channel", async () => {
    semanticRelease.mockResolvedValue({ releases: [{ version: "0.2.0" }] });

    await releasePackage();

    expect(await readFile(output, "utf8")).toBe(
      "has_releases=false\nhas_releases=true\n",
    );
  });

  it("blocks publication when a stale checkout skips analysis and keeps its development version", async () => {
    vi.stubEnv("CI_DRY_RUN", "false");
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "@cmx-tools/contracts",
        version: "0.0.0-development",
      }),
    );
    semanticRelease.mockResolvedValue(false);

    await expect(releasePackage()).rejects.toThrow(
      "Refusing to publish @cmx-tools/contracts with version 0.0.0-development",
    );
  });

  it("allows an unchanged dependency after its existing release version was selected", async () => {
    vi.stubEnv("CI_DRY_RUN", "false");
    semanticRelease.mockResolvedValue(false);

    await expect(releasePackage()).resolves.toBeUndefined();
  });
});
