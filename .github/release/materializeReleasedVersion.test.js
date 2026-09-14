import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import releaseConfig from "./release.config.js";

const pluginPath = releaseConfig.plugins.find(
  (plugin) =>
    typeof plugin === "string" &&
    basename(plugin) === "materializeReleasedVersion.js",
);
const { analyzeCommits } = await import(pathToFileURL(pluginPath).href);

describe("release manifest versions", () => {
  let cwd;
  let manifestPath;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "cmx-release-manifest-"));
    manifestPath = join(cwd, "package.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: "@cmx-tools/contracts",
        version: "0.0.0-development",
        dependencies: { example: "^1.0.0" },
      }),
    );
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("uses the existing release version when another package will be published", async () => {
    const result = await analyzeCommits(
      {},
      { cwd, lastRelease: { version: "0.2.0" }, options: { dryRun: false } },
    );

    expect(JSON.parse(await readFile(manifestPath, "utf8"))).toEqual({
      name: "@cmx-tools/contracts",
      version: "0.2.0",
      dependencies: { example: "^1.0.0" },
    });
    expect(result).toBeUndefined();
  });

  it("leaves source versions untouched during a dry run", async () => {
    const source = await readFile(manifestPath, "utf8");

    await analyzeCommits(
      {},
      { cwd, lastRelease: { version: "0.2.0" }, options: { dryRun: true } },
    );

    expect(await readFile(manifestPath, "utf8")).toBe(source);
  });

  it.each([false, true])(
    "rejects a package without an initial release tag with dryRun=%s",
    async (dryRun) => {
      await expect(
        analyzeCommits({}, { cwd, lastRelease: {}, options: { dryRun } }),
      ).rejects.toThrow(
        "Publish the initial 0.1.0 version and tag that actual release",
      );
    },
  );

  it("keeps the prerelease version selected for the current branch", async () => {
    await analyzeCommits(
      {},
      {
        cwd,
        lastRelease: { version: "0.3.0-beta.2" },
        options: { dryRun: false },
      },
    );

    expect(JSON.parse(await readFile(manifestPath, "utf8")).version).toBe(
      "0.3.0-beta.2",
    );
  });
});
