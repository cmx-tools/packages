import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { REAL_PACKAGE_DIRS } from "./releasePackageSet.js";

const execFileAsync = promisify(execFile);
const ROOT_DIR = process.cwd();
const DIST_BINARIES = [
  { file: "packages/cli/dist/cli/cli.js", command: "cmx" },
  { file: "packages/bundle/dist/cli/cli.js", command: "cmx-bundle" },
  { file: "packages/document/dist/cli/cli.js", command: "cmx-document" },
  { file: "packages/environment/dist/cli/cli.js", command: "cmx-environment" },
  { file: "packages/verify/dist/cli/cli.js", command: "cmx-verify" },
] as const;

const EXPORT_CHECKS = [
  { packageDir: "cli", entryFile: "dist/src/index.js" },
  { packageDir: "bundle", entryFile: "dist/src/index.js" },
  { packageDir: "document", entryFile: "dist/src/index.js" },
  { packageDir: "environment", entryFile: "dist/src/index.js" },
  { packageDir: "contracts", entryFile: "dist/index.js" },
  { packageDir: "react", entryFile: "dist/index.js" },
  { packageDir: "reduce", entryFile: "dist/index.js" },
  { packageDir: "runtime", entryFile: "dist/index.js" },
  { packageDir: "verify", entryFile: "dist/src/index.js" },
] as const;

const packedDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    packedDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function runNode(
  args: string[],
  cwd = ROOT_DIR,
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("node", args, {
    cwd,
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function runCorepack(
  args: string[],
  cwd = ROOT_DIR,
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("corepack", ["pnpm", ...args], {
    cwd,
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

describe("package smoke", () => {
  it("keeps built CLI entrypoints invokable", async () => {
    for (const binary of DIST_BINARIES) {
      const result = await runNode([binary.file, "--help"]);
      expect(result.stdout + result.stderr).toContain(binary.command);
    }
  });

  it("keeps package exports and type exports resolvable after build", async () => {
    for (const entry of EXPORT_CHECKS) {
      const importTarget = path.join(
        ROOT_DIR,
        "packages",
        entry.packageDir,
        entry.entryFile,
      );
      const script = `import * as pkg from ${JSON.stringify(importTarget)};\nif (Object.keys(pkg).length === 0) throw new Error('missing exports');`;
      await runNode(["--input-type=module", "-e", script]);
      const packageJsonPath = path.join(
        ROOT_DIR,
        "packages",
        entry.packageDir,
        "package.json",
      );
      const packageJson = JSON.parse(
        await readFile(packageJsonPath, "utf8"),
      ) as { exports?: Record<string, { types?: string } | string> };

      const rootExport = packageJson.exports?.["."];
      if (typeof rootExport === "object" && rootExport !== null) {
        expect(typeof rootExport.types).toBe("string");
      }
    }
  });

  it("rewrites workspace:^ dependencies to caret ranges in packed output", async () => {
    for (const packageDir of REAL_PACKAGE_DIRS) {
      const cwd = path.join(ROOT_DIR, "packages", packageDir);
      const packDir = await mkdtemp(
        path.join(os.tmpdir(), `cmx-pack-${packageDir}-`),
      );
      packedDirs.push(packDir);

      const packResult = await runCorepack(
        ["pack", "--json", "--pack-destination", packDir],
        cwd,
      );

      const packOutput = JSON.parse(packResult.stdout.trim()) as
        | { filename: string }
        | Array<{ filename: string }>;
      const tarball = Array.isArray(packOutput)
        ? packOutput.at(-1)?.filename
        : packOutput.filename;

      expect(tarball).toBeTruthy();

      const tarballPath = tarball?.startsWith("/")
        ? tarball
        : path.join(packDir, tarball ?? "");
      await execFileAsync("tar", ["-xzf", tarballPath, "-C", packDir], {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const packedManifest = JSON.parse(
        await readFile(path.join(packDir, "package", "package.json"), "utf8"),
      ) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      };
      const sourceManifest = JSON.parse(
        await readFile(path.join(cwd, "package.json"), "utf8"),
      ) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      };

      const depGroups = [
        {
          packed: packedManifest.dependencies,
          source: sourceManifest.dependencies,
        },
        {
          packed: packedManifest.devDependencies,
          source: sourceManifest.devDependencies,
        },
        {
          packed: packedManifest.peerDependencies,
          source: sourceManifest.peerDependencies,
        },
        {
          packed: packedManifest.optionalDependencies,
          source: sourceManifest.optionalDependencies,
        },
      ];

      for (const group of depGroups) {
        for (const [name, value] of Object.entries(group.packed ?? {})) {
          if (
            name.startsWith("@cmx-tools/") &&
            group.source?.[name] === "workspace:^"
          ) {
            expect(value).toMatch(/^\^(0|[1-9]\d*)\.\d+\.\d+(?:-.+)?$/);
          }
        }
      }
    }
  }, 300_000);
});
