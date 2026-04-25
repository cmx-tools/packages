import {
  ErrorCode,
  TranspileError,
} from "./diagnostics.js";
import type { UnsupportedValuesPolicy } from "./props-policy.js";

export type CmxMeta = {
  data: unknown;
};

type KeepResult = { keep: true; value: unknown };
type DropResult = { keep: false };

type MetaNormalizationOptions = {
  unsupportedValues: UnsupportedValuesPolicy;
  isPlainObject(value: unknown): value is Record<string, unknown>;
  isRuntimeNode(value: unknown): boolean;
  isExternalRuntimeValue(value: unknown): boolean;
  normalizeRuntimeNode(value: unknown, pathLabel: string): unknown;
};

export function normalizeMeta(
  compiledModule: Record<string, unknown>,
  options: MetaNormalizationOptions,
): CmxMeta | undefined {
  if (!Object.prototype.hasOwnProperty.call(compiledModule, "meta")) {
    return undefined;
  }

  const normalizedMeta = normalizeMetaValue(compiledModule.meta, "meta", options);
  if (!normalizedMeta.keep) {
    return undefined;
  }

  return {
    data: normalizedMeta.value,
  };
}

function unsupportedMeta(
  pathLabel: string,
  options: MetaNormalizationOptions,
): DropResult {
  if (options.unsupportedValues === "omit") {
    return { keep: false };
  }

  throw new TranspileError(
    ErrorCode.UNSUPPORTED_VALUE,
    `Unsupported meta value at ${pathLabel}`,
  );
}

function normalizeMetaValue(
  value: unknown,
  pathLabel: string,
  options: MetaNormalizationOptions,
): KeepResult | DropResult {
  if (value === undefined) {
    return unsupportedMeta(pathLabel, options);
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return { keep: true, value };
  }

  if (options.isExternalRuntimeValue(value)) {
    throw new TranspileError(
      ErrorCode.EXTERNAL_RUNTIME_VALUE,
      "External import used as runtime value.",
    );
  }

  if (Array.isArray(value)) {
    const normalized: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const item = normalizeMetaValue(
        value[index],
        `${pathLabel}[${index}]`,
        options,
      );
      if (item.keep) {
        normalized.push(item.value);
      }
    }
    return { keep: true, value: normalized };
  }

  if (options.isRuntimeNode(value)) {
    return {
      keep: true,
      value: options.normalizeRuntimeNode(value, pathLabel),
    };
  }

  if (!options.isPlainObject(value)) {
    return unsupportedMeta(pathLabel, options);
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const result = normalizeMetaValue(
      nestedValue,
      `${pathLabel}.${key}`,
      options,
    );
    if (result.keep) {
      normalized[key] = result.value;
    }
  }
  return { keep: true, value: normalized };
}
