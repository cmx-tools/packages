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
  normalizeRuntimeNode(value: unknown, pathLabel: string): unknown;
  onRuntimeNodePath(path: SlotPath): void;
};

export function normalizeProps(
  value: Record<string, unknown>,
  pathLabel: string,
  options: NormalizePropOptions
): Record<string, unknown> | undefined {
  const normalized: Record<string, unknown> = {};
  for (const [key, propValue] of Object.entries(value)) {
    const result = normalizePropValue(
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
    ErrorCode.UNSUPPORTED_PROP_VALUE,
    `Unsupported prop value at ${pathLabel}`,
  );
}

function normalizePropValue(
  value: unknown,
  pathLabel: string,
  propPath: SlotPath,
  options: NormalizePropOptions
): KeepResult | DropResult {
  if (value === undefined) {
    return { keep: false };
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
      const item = normalizePropValue(
        value[index],
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

  if (options.isRuntimeNode(value)) {
    options.onRuntimeNodePath(propPath);
    return { keep: true, value: options.normalizeRuntimeNode(value, pathLabel) };
  }

  if (!options.isPlainObject(value)) {
    return unsupportedProp(pathLabel, options);
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const result = normalizePropValue(
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
