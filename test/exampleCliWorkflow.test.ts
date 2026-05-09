import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createExampleBackendTestServer } from "./createExampleBackendTestServer.js";

const execFileAsync = promisify(execFile);
const ROOT_DIR = process.cwd();

async function runPackageScript(cwd: string, script: string): Promise<void> {
  await execFileAsync("corepack", ["pnpm", "run", script], {
    cwd,
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

describe("example CLI workflow", () => {
  it("uses first-class CMX commands in example package scripts", async () => {
    const contentPackageJson = JSON.parse(
      await readFile(
        path.join(ROOT_DIR, "example", "content", "package.json"),
        "utf8",
      ),
    ) as { scripts: Record<string, string> };
    const backendPackageJson = JSON.parse(
      await readFile(
        path.join(ROOT_DIR, "example", "backend", "package.json"),
        "utf8",
      ),
    ) as { scripts: Record<string, string> };

    expect(contentPackageJson.scripts.compile).toContain("cmx-bundle compile");
    expect(contentPackageJson.scripts.render).toContain("cmx-document render");
    expect(contentPackageJson.scripts.build).not.toContain("tsx ");
    expect(contentPackageJson.scripts.build).not.toContain("scripts/");
    expect(backendPackageJson.scripts.build).toContain("cmx-environment");
    expect(backendPackageJson.scripts.build).not.toContain("tsx ");
    expect(backendPackageJson.scripts.build).not.toContain("scripts/");
  });

  it("compiles and renders documents with first-class CLIs", async () => {
    const contentDir = path.join(ROOT_DIR, "example", "content");
    await runPackageScript(contentDir, "compile");
    await runPackageScript(contentDir, "render");

    const bundleJson = await readFile(
      path.join(contentDir, "dist", "cmx-bundle.json"),
      "utf8",
    );
    const aboutDocument = await readFile(
      path.join(ROOT_DIR, "example", "backend", "_db_content", "about.json"),
      "utf8",
    );

    expect(bundleJson).toContain('"entries"');
    expect(aboutDocument).toContain('"$schema"');
    expect(aboutDocument).toContain('"@example/backend-contract"');
  }, 30_000);

  it("generates environment with backend-local external override", async () => {
    const backendDir = path.join(ROOT_DIR, "example", "backend");
    await runPackageScript(backendDir, "build");

    const environmentSource = await readFile(
      path.join(backendDir, "_gen_cmx_environment.ts"),
      "utf8",
    );

    expect(environmentSource).toContain('"@example/backend-contract": Api');
    expect(environmentSource).toContain('from "./api.js"');
    expect(environmentSource).toContain('"@example/ui-library"');
  }, 30_000);

  it("boots example backend against generated CLI artifacts", async () => {
    const contentDir = path.join(ROOT_DIR, "example", "content");
    const backendDir = path.join(ROOT_DIR, "example", "backend");
    await runPackageScript(contentDir, "build");
    await runPackageScript(backendDir, "build");

    const server = await createExampleBackendTestServer();

    try {
      const fallback = await fetch(new URL("/", server.url));
      const about = await fetch(new URL("/about", server.url));

      expect(fallback.status).toBe(200);
      expect(about.status).toBe(200);
      expect(await about.text()).toContain("<title>About</title>");
    } finally {
      await server.close();
    }
  }, 60_000);
});
