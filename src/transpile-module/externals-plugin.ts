import { readFile } from "node:fs/promises";
import type { Plugin } from "esbuild";

type FileSystemLike = {
  readFile(filePath: string): Promise<string | undefined> | string | undefined;
};

type ExternalsPluginOptions = {
  externals: string[];
  fs?: FileSystemLike;
};

type ImportBindings = {
  hasDefault: boolean;
  namedImports: Set<string>;
};

function isBareSpecifier(specifier: string): boolean {
  return !specifier.startsWith(".") && !specifier.startsWith("/");
}

function matchesExternalPattern(canonicalId: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    const base = pattern.slice(0, -3);
    return canonicalId === base || canonicalId.startsWith(`${base}/`);
  }

  if (pattern.endsWith("/*")) {
    const base = pattern.slice(0, -2);
    if (!canonicalId.startsWith(`${base}/`)) {
      return false;
    }

    const remainder = canonicalId.slice(base.length + 1);
    return remainder.length > 0 && !remainder.includes("/");
  }

  return pattern === canonicalId || canonicalId.startsWith(`${pattern}/`);
}

function matchesExternal(canonicalId: string, externals: string[]): boolean {
  for (const externalPattern of externals) {
    if (matchesExternalPattern(canonicalId, externalPattern)) {
      return true;
    }
  }
  return false;
}

async function readImporterSource(
  importer: string,
  virtualFs?: FileSystemLike,
): Promise<string> {
  const virtualContent = virtualFs ? await virtualFs.readFile(importer) : undefined;
  if (virtualContent !== undefined) {
    return virtualContent;
  }

  return readFile(importer, "utf8");
}

function collectImportBindings(
  source: string,
  targetSpecifier: string,
): ImportBindings {
  const bindings: ImportBindings = {
    hasDefault: false,
    namedImports: new Set<string>(),
  };

  const importRegex = /import\s+([\s\S]*?)\s+from\s+(['"])([^'"]+)\2/gu;
  for (const match of source.matchAll(importRegex)) {
    const clause = match[1]?.trim();
    const specifier = match[3];
    if (!clause || specifier !== targetSpecifier) {
      continue;
    }

    if (clause.startsWith("* as ")) {
      throw new Error(
        "[cmx:namespace-import-unsupported] Namespace imports are not supported for externals",
      );
    }

    if (clause.startsWith("{")) {
      addNamedBindings(bindings, clause);
      continue;
    }

    if (!clause.includes(",")) {
      bindings.hasDefault = true;
      continue;
    }

    const [defaultBinding, remainder] = clause.split(",", 2);
    if (defaultBinding && defaultBinding.trim().length > 0) {
      bindings.hasDefault = true;
    }
    if (remainder) {
      addNamedBindings(bindings, remainder.trim());
    }
  }

  return bindings;
}

function addNamedBindings(bindings: ImportBindings, rawClause: string): void {
  const clause = rawClause.trim();
  if (!clause.startsWith("{") || !clause.endsWith("}")) {
    return;
  }

  const inner = clause.slice(1, -1).trim();
  if (inner.length === 0) {
    return;
  }

  for (const part of inner.split(",")) {
    const segment = part.trim();
    if (segment.length === 0) {
      continue;
    }

    const [importedName] = segment.split(/\s+as\s+/u, 2);
    if (!importedName) {
      continue;
    }

    const normalized = importedName.trim();
    if (normalized === "default") {
      bindings.hasDefault = true;
      continue;
    }

    bindings.namedImports.add(normalized);
  }
}

async function resolveCanonicalModuleId(
  pluginBuild: Parameters<Plugin["setup"]>[0],
  args: {
    path: string;
    importer: string;
    resolveDir: string;
    kind: NonNullable<
      Parameters<Parameters<Plugin["setup"]>[0]["resolve"]>[1]
    >["kind"];
    namespace: string;
  },
): Promise<string> {
  const resolved = await pluginBuild.resolve(args.path, {
    importer: args.importer,
    resolveDir: args.resolveDir,
    kind: args.kind,
    namespace: args.namespace,
    pluginData: {
      skipExternalResolve: true,
    },
  });

  if (resolved.errors.length > 0) {
    return args.path;
  }

  if (isBareSpecifier(args.path) && !resolved.path.includes("/node_modules/")) {
    return resolved.path;
  }

  if (isBareSpecifier(args.path)) {
    return args.path;
  }

  return resolved.path;
}

export function normalizeExternals(externals: string[]): string[] {
  return externals
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      if (entry.endsWith("/**")) {
        const base = entry.slice(0, -3).replace(/\/+$/u, "");
        return `${base}/**`;
      }
      if (entry.endsWith("/*")) {
        const base = entry.slice(0, -2).replace(/\/+$/u, "");
        return `${base}/*`;
      }
      return entry.replace(/\/+$/u, "");
    });
}

export function externalsPlugin(options: ExternalsPluginOptions): Plugin {
  const namespace = "cmx-external";

  return {
    name: "cmx-externals",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /.*/ }, async (args) => {
        const skipByPluginData =
          typeof args.pluginData === "object" &&
          args.pluginData !== null &&
          "skipExternalResolve" in args.pluginData;
        if (skipByPluginData || options.externals.length === 0) {
          return;
        }

        if (
          args.kind === "entry-point" ||
          args.path === "cmx-internal/jsx-runtime" ||
          args.namespace === namespace ||
          args.namespace === "cmx-runtime"
        ) {
          return;
        }

        const canonicalId = await resolveCanonicalModuleId(pluginBuild, {
          path: args.path,
          importer: args.importer,
          resolveDir: args.resolveDir,
          kind: args.kind,
          namespace: args.namespace,
        });

        if (!matchesExternal(canonicalId, options.externals)) {
          return;
        }

        return {
          path: canonicalId,
          namespace,
          pluginData: {
            canonicalId,
            rawSpecifier: args.path,
            importer: args.importer,
          },
        };
      });

      pluginBuild.onLoad({ filter: /.*/, namespace }, async (args) => {
        const pluginData = args.pluginData as
          | {
              canonicalId?: string;
              rawSpecifier?: string;
              importer?: string;
            }
          | undefined;
        const canonicalId = pluginData?.canonicalId ?? args.path;
        const rawSpecifier = pluginData?.rawSpecifier;
        const importer = pluginData?.importer;

        if (!rawSpecifier || !importer) {
          return {
            loader: "js",
            contents: "export {};",
          };
        }

        const importerSource = await readImporterSource(importer, options.fs);
        const bindings = collectImportBindings(importerSource, rawSpecifier);
        const lines: string[] = [
          "import { __registerExternal } from 'cmx-internal/jsx-runtime';",
          `const __cmxFrom = ${JSON.stringify(canonicalId)};`,
        ];

        if (bindings.hasDefault) {
          lines.push(
            "export default __registerExternal({ from: __cmxFrom, importName: undefined });",
          );
        }

        for (const importName of [...bindings.namedImports].sort((a, b) =>
          a.localeCompare(b),
        )) {
          lines.push(
            `export const ${importName} = __registerExternal({ from: __cmxFrom, importName: ${JSON.stringify(importName)} });`,
          );
        }

        if (!bindings.hasDefault && bindings.namedImports.size === 0) {
          lines.push("export {};");
        }

        return {
          loader: "js",
          contents: lines.join("\n"),
        };
      });
    },
  };
}
