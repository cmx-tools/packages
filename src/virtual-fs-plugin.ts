import path from "node:path";

import type { Plugin } from "esbuild";

export type VirtualFileSystem = {
  readFile(filePath: string): Promise<string | undefined> | string | undefined;
};

function loaderFromFilePath(filePath: string): "ts" | "tsx" | "js" | "jsx" {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".ts") {
    return "ts";
  }
  if (ext === ".tsx") {
    return "tsx";
  }
  if (ext === ".jsx") {
    return "jsx";
  }
  return "js";
}

function createVirtualCandidates(basePath: string): string[] {
  const normalized = path.normalize(basePath);
  if (path.extname(normalized) !== "") {
    return [normalized];
  }
  return [
    normalized,
    `${normalized}.ts`,
    `${normalized}.tsx`,
    `${normalized}.js`,
    `${normalized}.jsx`,
    path.join(normalized, "index.ts"),
    path.join(normalized, "index.tsx"),
    path.join(normalized, "index.js"),
    path.join(normalized, "index.jsx")
  ];
}

export function virtualFsPlugin(virtualFs: VirtualFileSystem): Plugin {
  const namespace = "cmx-vfs";
  function isVirtualSpecifier(specifier: string): boolean {
    return specifier.startsWith(".") || specifier.startsWith("/");
  }

  async function resolveVirtualFile(specifier: string, importer?: string): Promise<string | null> {
    if (!isVirtualSpecifier(specifier)) {
      return null;
    }

    const basePath = specifier.startsWith(".")
      ? path.resolve(path.dirname(importer ?? "/"), specifier)
      : path.resolve(specifier);
    for (const candidate of createVirtualCandidates(basePath)) {
      const fileContent = await virtualFs.readFile(candidate);
      if (fileContent !== undefined) {
        return candidate;
      }
    }
    return null;
  }

  return {
    name: "cmx-virtual-fs",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /.*/ }, async (args) => {
        if (args.kind === "entry-point") {
          const resolvedEntry = await resolveVirtualFile(args.path);
          if (!resolvedEntry) {
            return;
          }
          return { path: resolvedEntry, namespace };
        }

        if (args.namespace !== namespace) {
          return;
        }

        const resolvedImport = await resolveVirtualFile(args.path, args.importer);
        if (!resolvedImport) {
          if (!isVirtualSpecifier(args.path)) {
            return;
          }
          return {
            errors: [{ text: `Virtual module not found: ${args.path}` }]
          };
        }
        return { path: resolvedImport, namespace };
      });

      pluginBuild.onLoad({ filter: /.*/, namespace }, async (args) => {
        const contents = await virtualFs.readFile(args.path);
        if (contents === undefined) {
          return {
            errors: [{ text: `Virtual module not found: ${args.path}` }]
          };
        }
        return {
          contents,
          loader: loaderFromFilePath(args.path),
          resolveDir: path.dirname(args.path)
        };
      });
    }
  };
}
