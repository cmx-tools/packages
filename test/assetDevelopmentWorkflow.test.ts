import { spawn, spawnSync } from "node:child_process";
import { access, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { createCmxTestbedWorkspace } from "./createCmxTestbedWorkspace.js";

it("prepares new Asset imports and reloads processor changes while developing", async () => {
  const workspace = await createCmxTestbedWorkspace();
  const config = (
    version: string,
  ) => `import {appendFile, mkdir} from "node:fs/promises";
    import {defineCmxAssetProcessor} from "@cmx-tools/assets";
    export default {assets: {
      processors: {photo: defineCmxAssetProcessor({
        version: "${version}", extensions: [".svg"],
        async process({file}) {
          await mkdir(new URL(".cmx", import.meta.url), {recursive: true});
          await appendFile(new URL(".cmx/processed", import.meta.url), "${version}");
          return {src: file(".svg"), width: 20};
        }
      })},
      storage: {async store() {throw new Error("Development preparation must not upload Assets");}}
    }};`;
  await workspace.writeSourceFiles({
    "package.json": '{"name":"asset-development","type":"module"}',
    "photo.svg": '<svg width="20" height="10"></svg>',
    "page.ts": 'import photo from "./photo.svg"; export default photo.width;',
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
      path.resolve("packages/assets/dist/cli/cli.js"),
      "prepare",
      "page.ts",
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
        if (String(chunk).includes("Watching Asset imports")) {
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
      "second.svg": '<svg width="40" height="20"></svg>',
      "page.ts":
        'import photo from "./photo.svg"; import second from "./second.svg"; export default [photo.width, second.width];',
    });
    await expect
      .poll(
        async () =>
          access(path.join(workspace.rootDir, "second.d.svg.ts")).then(
            () => true,
            () => false,
          ),
        { timeout: 10_000 },
      )
      .toBe(true);
    expect(
      await readFile(path.join(workspace.rootDir, ".cmx/processed"), "utf8"),
    ).toBe("11");
    const typecheck = spawnSync(
      path.resolve("node_modules/.bin/tsgo"),
      ["-p", path.join(workspace.rootDir, "tsconfig.json")],
      { encoding: "utf8", timeout: 30_000 },
    );
    expect(typecheck.status, typecheck.stdout + typecheck.stderr).toBe(0);
    await workspace.writeSourceFiles({ "cmx.config.ts": config("2") });
    await expect
      .poll(
        async () =>
          readFile(path.join(workspace.rootDir, ".cmx/processed"), "utf8"),
        { timeout: 10_000 },
      )
      .toBe("1122");
    expect(stderr).toBe("");
    child.kill("SIGTERM");
    expect(await exited).toBe(0);
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
}, 20_000);
