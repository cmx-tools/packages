import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import semanticRelease from "semantic-release";

const releaseConfig = fileURLToPath(
  new URL("./release.config.js", import.meta.url),
);

export async function releasePackage() {
  const dryRun = process.env.CI_DRY_RUN === "true";
  const result = await semanticRelease({
    extends: [releaseConfig, "semantic-release-monorepo"],
    dryRun,
  });

  if (!dryRun) {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "package.json"), "utf8"),
    );
    if (manifest.version === "0.0.0-development") {
      throw new Error(
        `Refusing to publish ${manifest.name} with version 0.0.0-development. Release analysis did not select a package version.`,
      );
    }
  }

  if (dryRun && result && process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, "has_releases=true\n");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await releasePackage();
}
