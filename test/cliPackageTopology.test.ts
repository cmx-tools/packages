import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT_DIR = process.cwd();

type PackageJson = {
  name: string;
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  exports?: Record<string, unknown>;
};

async function readPackageJson(relativePath: string): Promise<PackageJson> {
  const source = await readFile(path.join(ROOT_DIR, relativePath), "utf8");
  return JSON.parse(source) as PackageJson;
}

describe("CLI package topology", () => {
  it("keeps cmx-cli independent from capability packages", async () => {
    const cmxCli = await readPackageJson("packages/cmx-cli/package.json");
    expect(cmxCli.name).toBe("cmx-cli");
    expect(cmxCli.bin).toEqual({ cmx: "./dist/cli/cli.js" });
    expect(cmxCli.dependencies).not.toHaveProperty("cmx-bundle");
    expect(cmxCli.dependencies).not.toHaveProperty("cmx-document");
    expect(cmxCli.dependencies).not.toHaveProperty("cmx-environment");
  });

  it("uses cmx-cli as optional peer in capability packages", async () => {
    for (const pkg of ["cmx-bundle", "cmx-document", "cmx-environment"]) {
      const packageJson = await readPackageJson(`packages/${pkg}/package.json`);
      expect(packageJson.dependencies).not.toHaveProperty("cmx-cli");
      expect(packageJson.peerDependencies?.["cmx-cli"]).toBe(
        "^0.1.0 || ^1.0.0",
      );
      expect(packageJson.peerDependenciesMeta?.["cmx-cli"]?.optional).toBe(
        true,
      );
      expect(packageJson.exports).toHaveProperty("./cli");
    }
  });
});
