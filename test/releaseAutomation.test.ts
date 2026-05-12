import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT_DIR = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(ROOT_DIR, relativePath), "utf8");
}

describe("release automation", () => {
  it("runs CI verification for push and pull request on Node 24 using Corepack", async () => {
    const workflow = await readRepoFile(".github/workflows/ci.yml");

    expect(workflow).toContain("push:");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("node-version: 24");
    expect(workflow).toContain("corepack enable");
    expect(workflow).toContain("corepack pnpm install");
    expect(workflow).toContain("corepack pnpm run verify");
  });

  it("gates release to main alpha beta with trusted publishing permissions", async () => {
    const workflow = await readRepoFile(".github/workflows/release.yml");
    const releaseScript = await readRepoFile("scripts/release-ci.sh");

    expect(workflow).toContain("branches:");
    expect(workflow).toContain("- main");
    expect(workflow).toContain("- alpha");
    expect(workflow).toContain("- beta");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("needs: verify");
    expect(releaseScript).toContain(
      "semantic-release --extends ./release.config.js -e semantic-release-monorepo",
    );
    expect(releaseScript).toContain(
      'corepack pnpm -r --filter "@cmx-tools/*" --filter "[HEAD]" publish --access public --no-git-checks',
    );
    expect(workflow).not.toContain("NPM_TOKEN");
  });

  it("defines independent semantic release lanes and dry-run path", async () => {
    const config = await readRepoFile("release.config.js");
    const workflow = await readRepoFile(".github/workflows/release.yml");
    const releaseScript = await readRepoFile("scripts/release-ci.sh");

    expect(config).toContain("semantic-release-monorepo");
    expect(config).toContain('name: "main"');
    expect(config).toContain('name: "alpha"');
    expect(config).toContain('name: "beta"');
    expect(config).toContain("prerelease: true");
    expect(config).toContain("@semantic-release/commit-analyzer");
    expect(config).toContain("@semantic-release/release-notes-generator");
    expect(config).toContain("@semantic-release/npm");
    expect(config).toContain("@semantic-release/github");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("dry_run");
    expect(releaseScript).toContain("--dry-run");
  });
});
