import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createExampleBackendTestServer } from "./createExampleBackendTestServer.js";

const execFileAsync = promisify(execFile);
const ROOT_DIR = process.cwd();

async function runPackageScript(cwd: string, script: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "corepack",
    ["pnpm", "--silent", "run", script],
    {
      cwd,
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  return stdout;
}

describe("example CLI workflow", () => {
  it("uses first-class CMX commands in example package scripts", async () => {
    const contentPackageJson = JSON.parse(
      await readFile(
        path.join(ROOT_DIR, "example", "content", "package.json"),
        "utf8",
      ),
    ) as {
      scripts: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const backendPackageJson = JSON.parse(
      await readFile(
        path.join(ROOT_DIR, "example", "backend", "package.json"),
        "utf8",
      ),
    ) as {
      scripts: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(contentPackageJson.scripts.compile).toContain("cmx-bundle compile");
    expect(contentPackageJson.scripts.compile).toContain(
      "--config ../cmx.config.ts",
    );
    expect(contentPackageJson.scripts.compile).not.toContain("cross-env");
    expect(contentPackageJson.scripts.render).toContain("cmx-document render");
    expect(contentPackageJson.scripts.build).not.toContain("tsx ");
    expect(contentPackageJson.scripts.build).not.toContain("scripts/");
    expect(
      contentPackageJson.devDependencies?.["@cmx-tools/cli"],
    ).toBeDefined();
    expect(backendPackageJson.scripts.build).toContain("cmx-environment");
    expect(backendPackageJson.scripts.build).toContain(
      "--config ../cmx.config.ts",
    );
    expect(backendPackageJson.scripts.build).not.toContain("cross-env");
    expect(backendPackageJson.scripts.build).not.toContain("node_modules");
    expect(backendPackageJson.scripts.build).not.toContain("dist/cli.js");
    expect(backendPackageJson.scripts.build).not.toContain("tsx ");
    expect(backendPackageJson.scripts.build).not.toContain("scripts/");
    expect(
      backendPackageJson.devDependencies?.["@cmx-tools/cli"],
    ).toBeDefined();
  });

  it("compiles and renders documents with first-class CLIs", async () => {
    const contentDir = path.join(ROOT_DIR, "example", "content");
    await runPackageScript(contentDir, "compile");
    const documents = JSON.parse(await runPackageScript(contentDir, "render"));

    const bundleJson = await readFile(
      path.join(contentDir, "dist", "cmx-bundle.json"),
      "utf8",
    );
    expect(bundleJson).toContain('"entries"');
    expect(documents.about.$schema).toBeDefined();
    expect(documents.about.interface.imports).toHaveProperty(
      "@example/backend-contract",
    );
  }, 300_000);

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
  }, 180_000);

  it("boots the example backend and serves explicitly published CLI output", async () => {
    const server = await createExampleBackendTestServer();

    try {
      expect((await fetch(new URL("/about", server.url))).status).toBe(404);
      await execFileAsync("corepack", ["pnpm", "run", "example:publish"], {
        env: {
          ...process.env,
          CMX_PUBLISH_ENDPOINT: new URL("/_cmx/publication", server.url).href,
        },
        timeout: 30_000,
      });
      const fallback = await fetch(new URL("/", server.url));
      const about = await fetch(new URL("/about", server.url));

      expect(fallback.status).toBe(200);
      expect(about.status).toBe(200);
      const aboutHtml = await about.text();
      expect(aboutHtml).toContain("<title>About</title>");
      const assetPath = aboutHtml.match(/src="(\/_assets\/[^"]+)"/u)?.[1];
      expect(assetPath).toBeDefined();
      const asset = await fetch(new URL(assetPath!, server.url));
      expect(asset.status).toBe(200);
      expect(await asset.text()).toContain('width="12"');
      const srcset = aboutHtml.match(/srcset="([^"]+)"/iu)?.[1];
      expect(srcset).toContain(`${assetPath} 12w`);
      expect(srcset).toContain(" 24w");
      for (const candidate of srcset!.split(", ")) {
        const response = await fetch(
          new URL(candidate.split(" ")[0], server.url),
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("content-security-policy")).toBe(
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        );
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      }
    } finally {
      await server.close();
    }
  }, 300_000);
});
