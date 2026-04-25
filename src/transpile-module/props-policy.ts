export type UnsupportedValuesPolicy = "error" | "omit";

type KeepResult = { keep: true; value: unknown };
type DropResult = { keep: false };

type NormalizePropOptions = {
  unsupportedValues: UnsupportedValuesPolicy;
  isPlainObject(value: unknown): value is Record<string, unknown>;
  isRuntimeNode(value: unknown): boolean;
  normalizeRuntimeNode(value: unknown, pathLabel: string): unknown;
};

export function normalizeProps(
  value: Record<string, unknown>,
  pathLabel: string,
  options: NormalizePropOptions
): Record<string, unknown> | undefined {
  const normalized: Record<string, unknown> = {};
  for (const [key, propValue] of Object.entries(value)) {
    const result = normalizePropValue(propValue, `${pathLabel}.${key}`, options);
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

  throw new Error(`Unsupported prop value at ${pathLabel}`);
}

function normalizePropValue(
  value: unknown,
  pathLabel: string,
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

  if (Array.isArray(value)) {
    const normalized: unknown[] = [];

    for (let index = 0; index < value.length; index += 1) {
      const item = normalizePropValue(value[index], `${pathLabel}[${index}]`, options);
      if (item.keep) {
        normalized.push(item.value);
      }
    }

    return { keep: true, value: normalized };
  }

  if (options.isRuntimeNode(value)) {
    return { keep: true, value: options.normalizeRuntimeNode(value, pathLabel) };
  }

  if (!options.isPlainObject(value)) {
    return unsupportedProp(pathLabel, options);
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const result = normalizePropValue(nestedValue, `${pathLabel}.${key}`, options);
    if (result.keep) {
      normalized[key] = result.value;
    }
  }

  return { keep: true, value: normalized };
}
