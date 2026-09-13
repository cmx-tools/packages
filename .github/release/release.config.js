import { fileURLToPath } from "node:url";

/** @type {import('semantic-release').GlobalConfig} */
export default {
  branches: [
    { name: "main" },
    { name: "beta", prerelease: true },
    { name: "alpha", prerelease: true },
  ],
  repositoryUrl: "https://github.com/cmx-tools/packages",
  tagFormat: "${name}-${version}",
  verifyRelease: fileURLToPath(new URL("./verifyRelease.js", import.meta.url)),
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      { releaseRules: [{ breaking: true, release: "minor" }] },
    ],
    "@semantic-release/release-notes-generator",
    [
      "@semantic-release/npm",
      {
        npmPublish: false,
      },
    ],
    "@semantic-release/github",
  ],
  extends: ["semantic-release-monorepo"],
};
