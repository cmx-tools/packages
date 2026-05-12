import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXAMPLE_PACKAGE_DIRS,
  REAL_PACKAGE_DIRS,
  REAL_PACKAGE_NAMES,
} from "./releasePackageSet.js";

const ROOT_DIR = process.cwd();

type PackageJson = {
  name: string;
  private?: boolean;
  license?: string;
  publishConfig?: { access?: string };
  repository?: { type?: string; url?: string };
  bugs?: { url?: string };
  homepage?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const INTERNAL_DEP_KEYS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

async function readPackageJson(relativePath: string): Promise<PackageJson> {
  const source = await readFile(path.join(ROOT_DIR, relativePath), "utf8");
  return JSON.parse(source) as PackageJson;
}

function readDependencyValue(
  packageJson: PackageJson,
  dependencyName: string,
): string | undefined {
  for (const key of INTERNAL_DEP_KEYS) {
    const value = packageJson[key]?.[dependencyName];
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function readAllDependencyEntries(
  packageJson: PackageJson,
): [string, string][] {
  return INTERNAL_DEP_KEYS.flatMap((key) =>
    Object.entries(packageJson[key] ?? {}),
  );
}

describe("release readiness", () => {
  it("keeps all real packages scoped and publishable", async () => {
    const manifests = await Promise.all(
      REAL_PACKAGE_DIRS.map((dir) =>
        readPackageJson(path.join("packages", dir, "package.json")),
      ),
    );

    expect(manifests.map((manifest) => manifest.name).sort()).toEqual(
      [...REAL_PACKAGE_NAMES].sort(),
    );

    for (const manifest of manifests) {
      expect(manifest.private).not.toBe(true);
      expect(manifest.license).toBe("AGPL-3.0-only");
      expect(manifest.publishConfig?.access).toBe("public");
      expect(manifest.repository?.type).toBe("git");
      expect(manifest.repository?.url).toContain(
        "github.com/cmx-tools/packages",
      );
      expect(manifest.bugs?.url).toContain(
        "github.com/cmx-tools/packages/issues",
      );
      expect(manifest.homepage).toContain("github.com/cmx-tools/packages");
    }
  });

  it("prevents stale unscoped cmx dependencies and enforces workspace:^ internally", async () => {
    const manifests = await Promise.all(
      REAL_PACKAGE_DIRS.map((dir) =>
        readPackageJson(path.join("packages", dir, "package.json")),
      ),
    );

    for (const manifest of manifests) {
      const depEntries = readAllDependencyEntries(manifest);
      const stale = depEntries.filter(([name]) => /^cmx-/.test(name));
      expect(stale, `${manifest.name} has stale unscoped deps`).toEqual([]);

      for (const dependencyName of REAL_PACKAGE_NAMES) {
        const dependencyValue = readDependencyValue(manifest, dependencyName);
        if (dependencyValue !== undefined) {
          expect(
            dependencyValue,
            `${manifest.name} -> ${dependencyName} must use workspace:^`,
          ).toBe("workspace:^");
        }
      }
    }
  });

  it("keeps example packages local and unpublished", async () => {
    const manifests = await Promise.all(
      EXAMPLE_PACKAGE_DIRS.map((dir) =>
        readPackageJson(path.join("example", dir, "package.json")),
      ),
    );

    for (const manifest of manifests) {
      expect(manifest.name.startsWith("@cmx-tools/")).toBe(false);
      expect(manifest.publishConfig).toBeUndefined();
    }
  });
});
