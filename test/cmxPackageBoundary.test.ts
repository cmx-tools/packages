import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT_PACKAGE_NAME = "content-management-jsx";
const PUBLIC_PACKAGE_NAMES = [
  "cmx-bundle",
  "cmx-bundler",
  "cmx-runtime",
  "cmx-document-renderer",
  "cmx-react",
];

type PackageJson = {
  exports?: unknown;
};

describe("CMX package boundaries", () => {
  it("keeps the workspace root private without a root package export", async () => {
    const packageJson = await readPackageJson("package.json");

    expect(packageJson.exports).toBeUndefined();
    await expect(importPackage(ROOT_PACKAGE_NAME)).rejects.toThrow();
  });

  it("does not expose the removed all-in-one transpileModule API", async () => {
    await Promise.all(
      PUBLIC_PACKAGE_NAMES.map(async (packageName) => {
        const publicModule = await importPackage(packageName);

        expect(publicModule).not.toHaveProperty("transpileModule");
      }),
    );
  });
});

async function readPackageJson(packagePath: string): Promise<PackageJson> {
  return JSON.parse(
    await readFile(path.resolve(packagePath), "utf8"),
  ) as PackageJson;
}

async function importPackage(
  packageName: string,
): Promise<Record<string, unknown>> {
  return (await import(packageName)) as Record<string, unknown>;
}
