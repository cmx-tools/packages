export const REAL_PACKAGE_DIRS = [
  "bundle",
  "cli",
  "contracts",
  "document",
  "environment",
  "react",
  "reduce",
  "runtime",
  "verify",
] as const;

export const REAL_PACKAGE_NAMES = REAL_PACKAGE_DIRS.map(
  (dir) => `@cmx-tools/${dir}`,
);

export const EXAMPLE_PACKAGE_DIRS = [
  "backend",
  "content",
  "backend-contract",
  "ui-library",
] as const;
