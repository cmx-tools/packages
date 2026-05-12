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
  devDependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
};

async function readPackageJson(relativePath: string): Promise<PackageJson> {
  const source = await readFile(path.join(ROOT_DIR, relativePath), "utf8");
  return JSON.parse(source) as PackageJson;
}

describe("CLI package topology", () => {
  it("keeps @cmx-tools/cli independent from capability packages", async () => {
    const cmxCli = await readPackageJson("packages/cli/package.json");
    expect(cmxCli.name).toBe("@cmx-tools/cli");
    expect(cmxCli.bin).toEqual({ cmx: "./dist/cli/cli.js" });
    expect(cmxCli.dependencies).not.toHaveProperty("@cmx-tools/bundle");
    expect(cmxCli.dependencies).not.toHaveProperty("@cmx-tools/document");
    expect(cmxCli.dependencies).not.toHaveProperty("@cmx-tools/environment");
  });

  it("uses @cmx-tools/cli as optional peer in capability packages", async () => {
    for (const pkg of ["bundle", "document", "environment"]) {
      const packageJson = await readPackageJson(`packages/${pkg}/package.json`);
      expect(packageJson.dependencies).not.toHaveProperty("@cmx-tools/cli");
      expect(packageJson.peerDependencies?.["@cmx-tools/cli"]).toBe(
        "^0.1.0 || ^1.0.0",
      );
      expect(
        packageJson.peerDependenciesMeta?.["@cmx-tools/cli"]?.optional,
      ).toBe(true);
      expect(packageJson.devDependencies?.["@cmx-tools/cli"]).toBe(
        "workspace:^",
      );
      expect(packageJson.exports).toHaveProperty("./cli");
    }
  });
});
