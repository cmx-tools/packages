export function canonicalJson(value: unknown): string {
  return encode(value, new Set());
}

function encode(value: unknown, ancestors: Set<object>): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (typeof value !== "object" || value === null || ancestors.has(value)) {
    throw invalidJson();
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  )
    throw invalidJson();
  if (
    Object.getOwnPropertySymbols(value).some((key) =>
      Object.prototype.propertyIsEnumerable.call(value, key),
    )
  )
    throw invalidJson();
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw invalidJson();
        items.push(encode(value[index], ancestors));
      }
      return `[${items.join(",")}]`;
    }
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${encode((value as Record<string, unknown>)[key], ancestors)}`,
      )
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function invalidJson(): TypeError {
  return new TypeError(
    "Publication content must contain only JSON values without cycles.",
  );
}
