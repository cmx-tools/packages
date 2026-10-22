import { spawn, spawnSync } from "node:child_process";
import { access, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { createCmxTestbedWorkspace } from "./createCmxTestbedWorkspace.js";

it("rebuilds typed Asset imports and recovers edits through the normal CMX build watcher", async () => {
  const workspace = await createCmxTestbedWorkspace();
  const hashedAsset = `${"a".repeat(64)}.svg`;
  const source = (imports: string, value: string) =>
    `import type {CmxAssetJson} from "@cmx-tools/contracts"; ${imports} const page: CmxAssetJson = ${value}; export default page;`;
  const config = (
    version: string,
  ) => `import {appendFile, mkdir, writeFile} from "node:fs/promises";
    import {createHash} from "node:crypto";
    import type {CmxAssetLoader} from "@cmx-tools/assets";
    import type {CmxConfig} from "@cmx-tools/contracts";
    export default {exports: {default: {required: true, type: {from: "@cmx-tools/contracts", import: "CmxAssetJson"}}}, assets: {
      cacheDir: "asset-cache",
      loaders: {photo: {
        version: "${version}", extensions: [".svg"],
        options: {directory: "served", publicBaseUrl: "https://assets.example"},
        async load({bytes, relativePath, options}) {
          await mkdir(new URL(".cmx", import.meta.url), {recursive: true});
          await appendFile(new URL(".cmx/loaded", import.meta.url), "${version}");
          const key = createHash("sha256").update(bytes).digest("hex") + ".svg";
          await mkdir(new URL(options.directory, import.meta.url), {recursive: true});
          try {await writeFile(new URL(options.directory + "/" + key, import.meta.url), bytes, {flag: "wx"});}
          catch (error) {if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;}
          return {revision: "${version}", name: relativePath, src: options.publicBaseUrl + "/" + key, width: Number(new TextDecoder().decode(bytes).match(/width="(\\d+)"/)?.[1])};
        }
      } satisfies CmxAssetLoader<{directory: string; publicBaseUrl: string}>}
    }} satisfies CmxConfig;`;
  await workspace.writeSourceFiles({
    "package.json": '{"name":"asset-development","type":"module"}',
    "photo.svg": '<svg width="20" height="10"></svg>',
    "page.ts": source('import photo from "./photo.svg";', "photo.width"),
    "cmx.config.ts": config("1"),
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        allowArbitraryExtensions: true,
        types: ["node"],
      },
      include: ["page.ts"],
    }),
  });
  const child = spawn(
    process.execPath,
    [
      path.resolve("packages/bundle/dist/cli/cli.js"),
      "compile",
      "page*.ts",
      "output",
      "--watch",
      "--cwd",
      workspace.rootDir,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const exited = new Promise<number | null>((resolve) =>
    child.once("exit", resolve),
  );
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Asset watcher did not start: ${stderr}`)),
        10_000,
      );
      child.stdout.on("data", (chunk) => {
        if (String(chunk).includes("Watching CMX sources")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Asset watcher exited ${code}: ${stderr}`));
      });
    });
    await workspace.writeSourceFiles({
      [hashedAsset]: '<svg width="40" height="20"></svg>',
      "page.ts": source(
        `import photo from "./photo.svg"; import second from "./${hashedAsset}";`,
        "[photo, second]",
      ),
    });
    await expect
      .poll(
        async () =>
          access(
            path.join(
              workspace.rootDir,
              hashedAsset.replace(".svg", ".d.svg.ts"),
            ),
          ).then(
            () => true,
            () => false,
          ),
        { timeout: 10_000 },
      )
      .toBe(true);
    expect(
      await readFile(path.join(workspace.rootDir, ".cmx/loaded"), "utf8"),
    ).toBe("11");
    await expect
      .poll(() => renderBuild(workspace.rootDir).page.content.default, {
        timeout: 10_000,
      })
      .toMatchObject([
        { width: 20, revision: "1" },
        { width: 40, revision: "1" },
      ]);
    const typecheck = spawnSync(
      path.resolve("node_modules/.bin/tsgo"),
      ["-p", path.join(workspace.rootDir, "tsconfig.json")],
      { encoding: "utf8", timeout: 30_000 },
    );
    expect(typecheck.status, typecheck.stdout + typecheck.stderr).toBe(0);
    await workspace.writeSourceFiles({
      [hashedAsset]: '<svg width="80" height="40"></svg>',
    });
    await expect
      .poll(() => renderBuild(workspace.rootDir).page.content.default, {
        timeout: 10_000,
      })
      .toMatchObject([
        { width: 20, revision: "1" },
        { width: 80, revision: "1" },
      ]);
    expect(stderr).toBe("");
    await workspace.writeSourceFiles({
      "page.ts": source(
        'import missing from "./missing.svg";',
        "missing.width",
      ),
    });
    await expect
      .poll(() => stderr, { timeout: 10_000 })
      .toContain("missing.svg");
    await workspace.writeSourceFiles({
      "page.ts": source(
        `import photo from "./photo.svg"; import second from "./${hashedAsset}";`,
        "[photo, second]",
      ),
      "page-two.ts": source(
        `import second from "./${hashedAsset}";`,
        "second.width",
      ),
    });
    await expect
      .poll(() => renderBuild(workspace.rootDir)["page-two"]?.content.default, {
        timeout: 10_000,
      })
      .toBe(80);
    await workspace.writeSourceFiles({ "cmx.config.ts": config("2") });
    await expect
      .poll(
        async () =>
          readFile(path.join(workspace.rootDir, ".cmx/loaded"), "utf8"),
        { timeout: 10_000 },
      )
      .toBe("11122");
    child.kill("SIGTERM");
    expect(await exited).toBe(0);
    expect(renderBuild(workspace.rootDir).page.content.default).toMatchObject([
      { width: 20, revision: "2" },
      { width: 80, revision: "2" },
    ]);
  } catch (cause) {
    throw new Error(
      `Asset development workflow failed. Watcher state: ${child.exitCode ?? child.signalCode ?? "running"}. Stderr: ${stderr || "<empty>"}`,
      { cause },
    );
  } finally {
    child.kill("SIGTERM");
    await exited;
    await rm(workspace.rootDir, { recursive: true, force: true });
  }
}, 40_000);

function renderBuild(
  rootDir: string,
): Record<string, { content: { default: unknown } }> {
  const rendered = spawnSync(
    process.execPath,
    [
      path.resolve("packages/document/dist/cli/cli.js"),
      "render",
      path.join(rootDir, "output"),
      "--complete-only",
    ],
    { encoding: "utf8", timeout: 10_000 },
  );
  if (rendered.status !== 0)
    throw new Error(
      rendered.stderr || rendered.error?.message || "Document Rendering failed",
    );
  return JSON.parse(rendered.stdout);
}
