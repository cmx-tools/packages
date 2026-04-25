import {
  ErrorCode,
  TranspileError,
} from "./diagnostics.js";

export type UnsupportedValuesPolicy = "error" | "omit";
export type SlotPathSegment = string | number;
export type SlotPath = SlotPathSegment[];

type KeepResult = { keep: true; value: unknown };
type DropResult = { keep: false };

type NormalizePropOptions = {
  unsupportedValues: UnsupportedValuesPolicy;
  isPlainObject(value: unknown): value is Record<string, unknown>;
  isRuntimeNode(value: unknown): boolean;
  isExternalRuntimeValue(value: unknown): boolean;
  normalizeRuntimeNode(value: unknown, pathLabel: string): Promise<unknown>;
  onRuntimeNodePath(path: SlotPath): void;
};

export function normalizeProps(
  value: Record<string, unknown>,
  pathLabel: string,
  options: NormalizePropOptions
): Promise<Record<string, unknown> | undefined> {
  return normalizePropsInternal(value, pathLabel, options);
}

async function normalizePropsInternal(
  value: Record<string, unknown>,
  pathLabel: string,
  options: NormalizePropOptions,
): Promise<Record<string, unknown> | undefined> {
  const normalized: Record<string, unknown> = {};
  for (const [key, propValue] of Object.entries(value)) {
    const result = await normalizePropValue(
      propValue,
      `${pathLabel}.${key}`,
      [key],
      options,
    );
    if (result.keep) {
      normalized[key] = result.value;
    }
  }

  if (Object.keys(normalized).length === 0) {
    return undefined;
  }

  return normalized;
}

function unsupportedProp(pathLabel: string, options: NormalizePropOptions): DropResult {
  if (options.unsupportedValues === "omit") {
    return { keep: false };
  }

  throw new TranspileError(
    ErrorCode.UNSUPPORTED_VALUE,
    `Unsupported prop value at ${pathLabel}`,
  );
}

function normalizePropValue(
  value: unknown,
  pathLabel: string,
  propPath: SlotPath,
  options: NormalizePropOptions
): Promise<KeepResult | DropResult> {
  return normalizePropValueInternal(value, pathLabel, propPath, options);
}

async function normalizePropValueInternal(
  value: unknown,
  pathLabel: string,
  propPath: SlotPath,
  options: NormalizePropOptions,
): Promise<KeepResult | DropResult> {
  const resolvedValue = await value;

  if (resolvedValue === undefined) {
    return { keep: false };
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
      const item = await normalizePropValue(
        resolvedValue[index],
        `${pathLabel}[${index}]`,
        [...propPath, index],
        options,
      );
      if (item.keep) {
        normalized.push(item.value);
      }
    }

    return { keep: true, value: normalized };
  }

  if (options.isRuntimeNode(resolvedValue)) {
    options.onRuntimeNodePath(propPath);
    return {
      keep: true,
      value: await options.normalizeRuntimeNode(resolvedValue, pathLabel),
    };
  }

  if (!options.isPlainObject(resolvedValue)) {
    return unsupportedProp(pathLabel, options);
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(resolvedValue)) {
    const result = await normalizePropValue(
      nestedValue,
      `${pathLabel}.${key}`,
      [...propPath, key],
      options,
    );
    if (result.keep) {
      normalized[key] = result.value;
    }
  }

  return { keep: true, value: normalized };
}
