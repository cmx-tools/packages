import { ImportNameKind, parseSync } from "oxc-parser";
import { ErrorCode } from "./diagnostics.js";

/**
 * `transpileModule` needs runtime import shapes for external stubs. Oxc
 * `parseSync(...).module.staticImports` exposes:
 * - `moduleRequest.value` — import source string
 * - `entries[].importName` — { kind, name } (Name | Default | NamespaceObject)
 * - `entries[].isType` — `import { type T }` / `import type ...`
 * Side-effect imports are `entries.length === 0` on the `StaticImport`.
 * No regex on source.
 */
export type ImportBindings = {
  hasDefault: boolean;
  namedImports: Set<string>;
};

export type ExternalImportScan = {
  bindings: ImportBindings;
  /** `import "specifier"` (no specifiers) for this module request. */
  hasSideEffectOnly: boolean;
};

export function collectExternalImportBindingInfo(
  source: string,
  targetSpecifier: string,
  filename: string,
): ExternalImportScan {
  const { module, errors } = parseSync(filename, source, { sourceType: "module" });
  if (errors.length > 0) {
    throw new Error(
      `Failed to parse importer for external bindings: ${errors[0]?.message ?? "parse error"}`,
    );
  }

  const bindings: ImportBindings = {
    hasDefault: false,
    namedImports: new Set<string>(),
  };
  let hasSideEffectOnly = false;

  for (const st of module.staticImports) {
    if (st.moduleRequest.value !== targetSpecifier) {
      continue;
    }
    if (st.entries.length === 0) {
      hasSideEffectOnly = true;
      continue;
    }

    for (const entry of st.entries) {
      if (entry.isType) {
        continue;
      }
      if (entry.importName.kind === ImportNameKind.NamespaceObject) {
        throw new Error(
          `[cmx:${ErrorCode.NAMESPACE_IMPORT_UNSUPPORTED}] Namespace imports are not supported for externals`,
        );
      }
      if (entry.importName.kind === ImportNameKind.Default) {
        bindings.hasDefault = true;
        continue;
      }
      if (entry.importName.kind === ImportNameKind.Name) {
        const name = entry.importName.name;
        if (name === null) {
          continue;
        }
        if (name === "default") {
          bindings.hasDefault = true;
        } else {
          bindings.namedImports.add(name);
        }
      }
    }
  }

  return { bindings, hasSideEffectOnly };
}
