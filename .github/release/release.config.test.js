import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import releaseConfig from "./release.config.js";

const analyzer = releaseConfig.plugins.find(
  (plugin) =>
    (Array.isArray(plugin) ? plugin[0] : plugin) ===
    "@semantic-release/commit-analyzer",
);
const analyzerOptions = Array.isArray(analyzer) ? analyzer[1] : {};

describe("unstable package releases", () => {
  it("keeps the document-verification API break on the minor release path", async () => {
    const release = await analyzeCommits(analyzerOptions, {
      cwd: process.cwd(),
      commits: [
        {
          hash: "6b833ac",
          message: `feat(verify)!: separate document assertions from policy calls

BREAKING CHANGE: Remove validateCmxDocument, ValidateCmxDocumentInput, and
ValidateCmxDocumentResult. Call verifyCmxDocument or assertCmxDocument for
structural verification, then invoke the selected CmxVerifyDocument function
directly. Direct policy calls return valid/diagnostics and may throw. The CLI
now rejects malformed CMX structure even when no policy is configured.`,
        },
      ],
      logger: { log() {} },
    });

    expect(release).toBe("minor");
  });

  it.each([
    ["feat(intrinsics): support declarative HTML authoring", "minor"],
    ["fix(react): preserve custom CSS properties", "patch"],
    ["perf(bundle): reuse TypeScript program analysis", "patch"],
  ])(
    "keeps the standard release increment for %s",
    async (message, expected) => {
      const release = await analyzeCommits(analyzerOptions, {
        cwd: process.cwd(),
        commits: [{ hash: "content-change", message }],
        logger: { log() {} },
      });

      expect(release).toBe(expected);
    },
  );

  it("blocks semantic-release's default 1.0.0 for an unbootstrapped package", async () => {
    await expect(
      verifyConfiguredRelease({
        cwd: "/content/packages/intrinsics",
        lastRelease: {},
        nextRelease: { version: "1.0.0" },
      }),
    ).rejects.toThrow(
      "Publish the initial 0.1.0 version and tag that actual release before retrying",
    );
  });

  it.each(["0.2.0", "0.1.1", "0.2.0-beta.1"])(
    "allows the planned unstable release %s",
    async (version) => {
      await expect(
        verifyConfiguredRelease({
          cwd: "/content/packages/verify",
          lastRelease: { version: "0.1.0" },
          nextRelease: { version },
        }),
      ).resolves.toBeUndefined();
    },
  );

  it("blocks a stable major even when another release plugin requests it", async () => {
    await expect(
      verifyConfiguredRelease({
        cwd: "/content/packages/verify",
        lastRelease: { version: "0.1.0" },
        nextRelease: { version: "1.0.0-beta.1" },
      }),
    ).rejects.toThrow(
      "A stable release requires an explicit change to the release policy",
    );
  });
});

async function verifyConfiguredRelease(context) {
  const { verifyRelease } = await import(
    pathToFileURL(releaseConfig.verifyRelease).href
  );
  return verifyRelease({}, context);
}
