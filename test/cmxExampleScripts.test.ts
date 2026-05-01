import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REMOVED_CLI_COMMANDS = ["cmx-bundle", "cmx-render-tree", "cmx-provide"];

type PackageJson = {
  scripts?: Record<string, string>;
};

describe("CMX example scripts", () => {
  it("uses node scripts and library API calls instead of CMX CLI commands", async () => {
    const contentPackage = await readPackageJson(
      "example/content/package.json",
    );
    const backendPackage = await readPackageJson(
      "example/backend/package.json",
    );
    const scripts = {
      ...contentPackage.scripts,
      ...backendPackage.scripts,
    };

    expect(scripts.build).toBe("tsx cmxBundleExample.ts");
    expect(scripts.postbuild).toBe("tsx cmxRenderDocumentsExample.ts");
    expect(scripts["gen:cmx-env"]).toBe(
      "tsx cmxGenerateEnvironmentSourceExample.ts",
    );
    for (const script of Object.values(scripts)) {
      for (const command of REMOVED_CLI_COMMANDS) {
        expect(script).not.toContain(command);
      }
    }

    await expect(
      readFile("example/content/cmxBundleExample.ts", "utf8"),
    ).resolves.toContain("cmxBundle(");
    await expect(
      readFile("example/content/cmxRenderDocumentsExample.ts", "utf8"),
    ).resolves.toContain("renderCmxDocuments(");
    await expect(
      readFile(
        "example/backend/cmxGenerateEnvironmentSourceExample.ts",
        "utf8",
      ),
    ).resolves.toContain("cmxGenerateEnvironmentSource(");
  });
});

async function readPackageJson(packagePath: string): Promise<PackageJson> {
  return JSON.parse(
    await readFile(path.resolve(packagePath), "utf8"),
  ) as PackageJson;
}
