import { appendFile } from "node:fs/promises";
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

  if (dryRun && result && process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, "has_releases=true\n");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await releasePackage();
}
