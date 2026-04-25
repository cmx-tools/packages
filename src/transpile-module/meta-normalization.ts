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
  normalizeRuntimeNode(value: unknown, pathLabel: string): Promise<unknown>;
};

export function normalizeMeta(
  compiledModule: Record<string, unknown>,
  options: MetaNormalizationOptions,
): Promise<CmxMeta | undefined> {
  return normalizeMetaInternal(compiledModule, options);
}

async function normalizeMetaInternal(
  compiledModule: Record<string, unknown>,
  options: MetaNormalizationOptions,
): Promise<CmxMeta | undefined> {
  if (!Object.prototype.hasOwnProperty.call(compiledModule, "meta")) {
    return undefined;
  }

  const normalizedMeta = await normalizeMetaValue(
    compiledModule.meta,
    "meta",
    options,
  );
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
): Promise<KeepResult | DropResult> {
  return normalizeMetaValueInternal(value, pathLabel, options);
}

async function normalizeMetaValueInternal(
  value: unknown,
  pathLabel: string,
  options: MetaNormalizationOptions,
): Promise<KeepResult | DropResult> {
  const resolvedValue = await value;

  if (resolvedValue === undefined) {
    return unsupportedMeta(pathLabel, options);
  }

  if (
    resolvedValue === null ||
    typeof resolvedValue === "string" ||
    typeof resolvedValue === "number" ||
    typeof resolvedValue === "boolean"
  ) {
    return { keep: true, value: resolvedValue };
  }

  if (options.isExternalRuntimeValue(resolvedValue)) {
    throw new TranspileError(
      ErrorCode.EXTERNAL_RUNTIME_VALUE,
      "External import used as runtime value.",
    );
  }

  if (Array.isArray(resolvedValue)) {
    const normalized: unknown[] = [];
    for (let index = 0; index < resolvedValue.length; index += 1) {
      const item = await normalizeMetaValue(
        resolvedValue[index],
        `${pathLabel}[${index}]`,
        options,
      );
      if (item.keep) {
        normalized.push(item.value);
      }
    }
    return { keep: true, value: normalized };
  }

  if (options.isRuntimeNode(resolvedValue)) {
    return {
      keep: true,
      value: await options.normalizeRuntimeNode(resolvedValue, pathLabel),
    };
  }

  if (!options.isPlainObject(resolvedValue)) {
    return unsupportedMeta(pathLabel, options);
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(resolvedValue)) {
    const result = await normalizeMetaValue(
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
