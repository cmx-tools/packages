import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export { materializeReleasedVersion as analyzeCommits };

export async function materializeReleasedVersion(
  _pluginConfig,
  { cwd, lastRelease, options },
) {
  if (!lastRelease.version) {
    throw new Error(
      `No release version is available for ${cwd}. Publish the initial 0.1.0 version and tag that actual release before retrying.`,
    );
  }

  if (options.dryRun) {
    return;
  }

  const manifestPath = join(cwd, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = lastRelease.version;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
