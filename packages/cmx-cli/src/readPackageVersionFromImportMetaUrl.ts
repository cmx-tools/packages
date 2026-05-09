import { readFileSync } from "node:fs";

const packageVersionCache = new Map<string, string>();

export function readPackageVersionFromImportMetaUrl(
  importMetaUrl: string | URL,
): string {
  const baseUrl =
    importMetaUrl instanceof URL ? importMetaUrl : new URL(importMetaUrl);
  const cacheKey = baseUrl.href;
  const cachedVersion = packageVersionCache.get(cacheKey);
  if (cachedVersion !== undefined) {
    return cachedVersion;
  }
  const packageJsonCandidates = [
    new URL("../package.json", baseUrl),
    new URL("../../package.json", baseUrl),
  ];
  for (const packageJsonPath of packageJsonCandidates) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        version?: unknown;
      };
      if (typeof packageJson.version === "string") {
        packageVersionCache.set(cacheKey, packageJson.version);
        return packageJson.version;
      }
    } catch {
      continue;
    }
  }
  throw new Error("Missing package version");
}
