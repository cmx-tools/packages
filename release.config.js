/** @type {import('semantic-release').GlobalConfig} */
export default {
  branches: [
    { name: "main" },
    { name: "beta", prerelease: true },
    { name: "alpha", prerelease: true },
  ],
  tagFormat: "${name}@${version}",
  plugins: [
    "@semantic-release/commit-analyzer",
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
