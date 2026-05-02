import { readFileSync } from "node:fs";

export type ConsumerPackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

export function readConsumerPackageJson(path: string): ConsumerPackageJson {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as ConsumerPackageJson;
}

/**
 * Resolve order: dependencies → devDependencies → peerDependencies → optionalDependencies.
 */
export function findConsumerDependencySpecifier(
  consumer: ConsumerPackageJson,
  packageName: string,
): string | undefined {
  const sections = [
    consumer.dependencies,
    consumer.devDependencies,
    consumer.peerDependencies,
    consumer.optionalDependencies,
  ];
  for (const section of sections) {
    const value = section?.[packageName];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}
