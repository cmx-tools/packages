import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  { file: "packages/publish/dist/cli/cli.js", command: "cmx-publish" },
] as const;

const EXPORT_CHECKS = [
  { packageDir: "assets", entryFile: "dist/src/index.js" },
  { packageDir: "cli", entryFile: "dist/src/index.js" },
  { packageDir: "bundle", entryFile: "dist/src/index.js" },
  { packageDir: "document", entryFile: "dist/src/index.js" },
  { packageDir: "document-host", entryFile: "dist/src/index.js" },
  { packageDir: "environment", entryFile: "dist/src/index.js" },
  { packageDir: "intrinsics", entryFile: "dist/index.js", typeOnly: true },
  { packageDir: "intrinsics", entryFile: "dist/jsx-runtime.js" },
  { packageDir: "intrinsics", entryFile: "dist/jsx-dev-runtime.js" },
  { packageDir: "markdown", entryFile: "dist/index.js" },
  { packageDir: "publish", entryFile: "dist/src/index.js" },
  { packageDir: "contracts", entryFile: "dist/index.js" },
  { packageDir: "react", entryFile: "dist/index.js" },
  { packageDir: "reduce", entryFile: "dist/index.js" },
  { packageDir: "remix", entryFile: "dist/index.js" },
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

async function packPackage(
  packageDir: string,
  destination: string,
): Promise<string> {
  const packed = await runCorepack(
    ["pack", "--json", "--pack-destination", destination],
    path.join(ROOT_DIR, "packages", packageDir),
  );
  const output = JSON.parse(packed.stdout.trim()) as
    | { filename: string }
    | Array<{ filename: string }>;
  const filename = Array.isArray(output)
    ? output.at(-1)?.filename
    : output.filename;
  expect(filename).toBeTruthy();
  return path.resolve(destination, filename!);
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
      const script = `import * as pkg from ${JSON.stringify(importTarget)};\n${"typeOnly" in entry ? "" : "if (Object.keys(pkg).length === 0) throw new Error('missing exports');"}`;
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

  it("lets a host use default Markdown bindings without authoring dependencies", async () => {
    const hostDir = await mkdtemp(path.join(os.tmpdir(), "cmx-markdown-host-"));
    packedDirs.push(hostDir);
    const contracts = await packPackage("contracts", hostDir);
    const reduce = await packPackage("reduce", hostDir);
    const rootManifest = JSON.parse(
      await readFile(path.join(ROOT_DIR, "package.json"), "utf8"),
    ) as { packageManager: string };
    await writeFile(
      path.join(hostDir, "package.json"),
      JSON.stringify({
        name: "markdown-host",
        private: true,
        type: "module",
        packageManager: rootManifest.packageManager,
      }),
    );
    await writeFile(
      path.join(hostDir, "pnpm-workspace.yaml"),
      `overrides:\n  '@cmx-tools/contracts': ${JSON.stringify(`file:${contracts}`)}\n`,
    );
    await runCorepack(
      ["add", "--offline", "--ignore-scripts", "--no-lockfile", reduce],
      hostDir,
    );
    const installed = await runCorepack(
      ["list", "--prod", "--depth", "Infinity", "--json"],
      hostDir,
    );
    const [host] = JSON.parse(installed.stdout) as Array<{
      dependencies: Record<
        string,
        {
          dependencies: Record<
            string,
            { dependencies?: Record<string, unknown> }
          >;
        }
      >;
    }>;
    expect(Object.keys(host!.dependencies)).toEqual(["@cmx-tools/reduce"]);
    const dependencies = host!.dependencies["@cmx-tools/reduce"]!.dependencies;
    expect(Object.keys(dependencies)).toEqual(["@cmx-tools/contracts"]);
    expect(dependencies["@cmx-tools/contracts"]!.dependencies ?? {}).toEqual(
      {},
    );
    const imported = await runNode(
      [
        "--input-type=module",
        "-e",
        'import { defaultCmxMarkdown } from "@cmx-tools/reduce"; console.log(defaultCmxMarkdown.h1);',
      ],
      hostDir,
    );
    expect(imported.stdout.trim()).toBe("h1");
  }, 120_000);

  it("installs the Markdown helper with no subdependencies", async () => {
    const contentDir = await mkdtemp(
      path.join(os.tmpdir(), "cmx-prose-content-"),
    );
    packedDirs.push(contentDir);
    const runtime = await packPackage("runtime", contentDir);
    const markdown = await packPackage("markdown", contentDir);
    const rootManifest = JSON.parse(
      await readFile(path.join(ROOT_DIR, "package.json"), "utf8"),
    ) as { packageManager: string };
    await writeFile(
      path.join(contentDir, "package.json"),
      JSON.stringify({
        name: "prose-content",
        private: true,
        type: "module",
        packageManager: rootManifest.packageManager,
      }),
    );
    await writeFile(
      path.join(contentDir, "pnpm-workspace.yaml"),
      `overrides:\n  '@cmx-tools/runtime': ${JSON.stringify(`file:${runtime}`)}\n`,
    );
    const store = await runCorepack(["store", "path"]);
    await runCorepack(
      [
        "add",
        "--offline",
        "--ignore-scripts",
        "--no-lockfile",
        "--store-dir",
        path.dirname(store.stdout.trim()),
        markdown,
      ],
      contentDir,
    );
    const installed = await runCorepack(
      ["list", "--prod", "--depth", "Infinity", "--json"],
      contentDir,
    );
    const [content] = JSON.parse(installed.stdout) as Array<{
      dependencies: Record<
        string,
        {
          dependencies: Record<
            string,
            { dependencies?: Record<string, unknown> }
          >;
        }
      >;
    }>;
    const dependencies =
      content!.dependencies["@cmx-tools/markdown"]!.dependencies;
    expect(Object.keys(dependencies).length).toBeLessThanOrEqual(3);
    for (const [name, dependency] of Object.entries(dependencies)) {
      expect(dependency.dependencies ?? {}, name).toEqual({});
    }
    await runNode(
      [
        "--input-type=module",
        "-e",
        'import { md } from "@cmx-tools/markdown"; md`# Hello`; ',
      ],
      contentDir,
    );
  }, 120_000);

  it("rewrites workspace:^ dependencies to caret ranges in packed output", async () => {
    for (const packageDir of REAL_PACKAGE_DIRS) {
      const cwd = path.join(ROOT_DIR, "packages", packageDir);
      const packDir = await mkdtemp(
        path.join(os.tmpdir(), `cmx-pack-${packageDir}-`),
      );
      packedDirs.push(packDir);

      const tarballPath = await packPackage(packageDir, packDir);
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
