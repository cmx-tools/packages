export const CMX_BUNDLE_VERSION = 1;
export const CMX_BUNDLE_FILE_NAME = "cmx-bundle.json";

export type CmxVersion = 1;

export type CmxTypeRef = {
  from: string;
  import?: string;
};

export type CmxDependency = {
  name: string;
  specifier: string;
  version: string;
  integrity?: string;
};

export type CmxBundleChunk = {
  file: string;
  sourcemap: string;
  isEntry: boolean;
};

export type CmxBundleEntry = {
  name: string;
  file: string;
  sourcemap: string;
  meta?: CmxBundleEntryMeta;
};

export type CmxBundleEntryMeta = {
  type?: CmxTypeRef;
};

export type CmxBundle = {
  version: typeof CMX_BUNDLE_VERSION;
  runtime: {
    importSource: string;
  };
  dependencies: CmxDependency[];
  entries: CmxBundleEntry[];
  chunks: CmxBundleChunk[];
};

export function parseCmxBundleJson(source: string): CmxBundle {
  return parseCmxBundle(JSON.parse(source));
}

function parseCmxBundle(value: unknown): CmxBundle {
  if (!isRecord(value)) {
    throw invalidBundle();
  }

  if (value.version !== CMX_BUNDLE_VERSION) {
    throw invalidBundle();
  }

  return {
    version: CMX_BUNDLE_VERSION,
    runtime: parseRuntime(value.runtime),
    dependencies: parseArray(value.dependencies, parseDependency),
    entries: parseArray(value.entries, parseEntry),
    chunks: parseArray(value.chunks, parseChunk),
  };
}

function parseRuntime(value: unknown): CmxBundle["runtime"] {
  if (!isRecord(value) || typeof value.importSource !== "string") {
    throw invalidBundle();
  }

  return {
    importSource: value.importSource,
  };
}

function parseEntry(value: unknown): CmxBundleEntry {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    typeof value.file !== "string" ||
    typeof value.sourcemap !== "string"
  ) {
    throw invalidBundle();
  }

  return {
    name: value.name,
    file: value.file,
    sourcemap: value.sourcemap,
    ...(value.meta === undefined ? {} : { meta: parseEntryMeta(value.meta) }),
  };
}

function parseEntryMeta(value: unknown): CmxBundleEntryMeta {
  if (!isRecord(value)) {
    throw invalidBundle();
  }

  return {
    ...(value.type === undefined ? {} : { type: parseMetaTypeRef(value.type) }),
  };
}

function parseMetaTypeRef(value: unknown): CmxTypeRef {
  if (!isRecord(value) || typeof value.from !== "string") {
    throw invalidBundle();
  }

  if (value.import !== undefined && typeof value.import !== "string") {
    throw invalidBundle();
  }

  return {
    from: value.from,
    ...(value.import === undefined ? {} : { import: value.import }),
  };
}

function parseDependency(value: unknown): CmxDependency {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    typeof value.specifier !== "string" ||
    typeof value.version !== "string"
  ) {
    throw invalidBundle();
  }

  if (value.integrity !== undefined && typeof value.integrity !== "string") {
    throw invalidBundle();
  }

  return {
    name: value.name,
    specifier: value.specifier,
    version: value.version,
    ...(value.integrity === undefined ? {} : { integrity: value.integrity }),
  };
}

function parseChunk(value: unknown): CmxBundleChunk {
  if (
    !isRecord(value) ||
    typeof value.file !== "string" ||
    typeof value.sourcemap !== "string" ||
    typeof value.isEntry !== "boolean"
  ) {
    throw invalidBundle();
  }

  return {
    file: value.file,
    sourcemap: value.sourcemap,
    isEntry: value.isEntry,
  };
}

function parseArray<T>(value: unknown, parseItem: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) {
    throw invalidBundle();
  }

  return value.map(parseItem);
}

function invalidBundle(): Error {
  return new Error("Invalid CMX bundle");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
