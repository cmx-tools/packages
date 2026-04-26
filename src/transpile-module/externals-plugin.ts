import { readFile } from "node:fs/promises";
import type { Plugin } from "esbuild";
import { collectExternalImportBindingInfo } from "./external-import-bindings.js";
import { ErrorCode } from "./diagnostics.js";

type FileSystemLike = {
  readFile(filePath: string): Promise<string | undefined> | string | undefined;
};

type ExternalsPluginOptions = {
  externals: string[];
  fs?: FileSystemLike;
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
        const { bindings, hasSideEffectOnly } = collectExternalImportBindingInfo(
          importerSource,
          rawSpecifier,
          importer,
        );

        if (hasSideEffectOnly) {
          throw new Error(
            `[cmx:${ErrorCode.SIDE_EFFECT_EXTERNAL_IMPORT_UNSUPPORTED}] Side-effect external imports are not supported; external modules are not executed at transpile time`,
          );
        }

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
