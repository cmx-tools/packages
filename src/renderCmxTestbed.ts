import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { rolldown } from "rolldown";
import {
  cmx,
  type CmxBundle,
  type UnsupportedMetaTypesPolicy,
} from "./cmx-bundler/index.js";
import type { CmxDiagnostic, CmxDiagnosticSource } from "./CmxDiagnostic.js";
import {
  renderCmxBundle,
  type CmxNode,
  type CmxManifest,
  type CmxMeta,
  type RenderCmxBundleCompleteResult,
  type RenderCmxBundleErrorResult,
  type RenderCmxBundlePartialResult,
  type CmxRenderDiagnostic,
  type UnsupportedValuesPolicy,
} from "./cmx-tree-renderer/index.js";

export type RenderCmxTestbedInput = {
  files: Record<string, string>;
  entry?: string;
  entries?: string[];
  externals?: string[];
  unsupportedMetaTypes?: UnsupportedMetaTypesPolicy;
  unsupportedValues?: UnsupportedValuesPolicy;
};

export type RenderCmxTestbedBundles = {
  bundle: CmxBundle;
  files: Record<string, string>;
  rootDir: string;
  outDir: string;
};

export type RenderCmxTestbedSuccessResult = RenderCmxTestbedBundles & {
  result: "tree";
  tree: CmxNode;
  meta?: CmxMeta;
  manifest: CmxManifest;
  diagnostics: [];
};

export type RenderCmxTestbedErrorResult = RenderCmxTestbedBundles & {
  result: "error";
  diagnostics: CmxRenderDiagnostic[];
};

export type RenderCmxTestbedBuildErrorResult = {
  result: "error";
  diagnostics: CmxDiagnostic[];
};

export type RenderCmxTestbedCompleteResult = RenderCmxTestbedBundles &
  RenderCmxBundleCompleteResult;

export type RenderCmxTestbedPartialResult = RenderCmxTestbedBundles &
  RenderCmxBundlePartialResult;

export type RenderCmxTestbedBundleErrorResult = RenderCmxTestbedBundles &
  RenderCmxBundleErrorResult;

export type RenderCmxTestbedResult =
  | RenderCmxTestbedSuccessResult
  | RenderCmxTestbedErrorResult
  | RenderCmxTestbedBuildErrorResult
  | RenderCmxTestbedCompleteResult
  | RenderCmxTestbedPartialResult
  | RenderCmxTestbedBundleErrorResult;

export async function renderCmxTestbed(
  input: RenderCmxTestbedInput,
): Promise<RenderCmxTestbedResult> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "cmx-testbed-"));
  const entry = input.entry ?? "entry.tsx";
  const entryFiles = input.entries
    ? Object.fromEntries(
        input.entries.map((entryPath) => [
          entryNameFromPath(entryPath),
          path.join(rootDir, entryPath),
        ]),
      )
    : path.join(rootDir, entry);
  await writeSourceFiles(rootDir, input.files);

  const outDir = path.join(rootDir, "dist");
  const build = await rolldown({
    input: entryFiles,
    plugins: [
      cmx({
        externals: input.externals,
        unsupportedMetaTypes: input.unsupportedMetaTypes,
      }),
    ],
  });

  try {
    const output = await build
      .write({
        dir: outDir,
        entryFileNames: input.entries ? "[name].js" : "entry.js",
      })
      .catch((error: unknown) => {
        throw new CmxTestbedBuildError(toBuildDiagnostic(error));
      });
    const emittedFileNames = output.output
      .map((item) => item.fileName)
      .sort((a, b) => a.localeCompare(b));
    await writeRuntimePackage(outDir);

    const files = await readOutputFiles(outDir, emittedFileNames);
    const bundle = JSON.parse(files["cmx-bundle.json"] ?? "") as CmxBundle;
    const bundleEntry = bundle.entries[0];
    if (!bundleEntry) {
      throw new Error("CMX testbed bundle has no entry.");
    }

    const bundleResult = {
      bundle,
      files,
      rootDir,
      outDir,
    };

    const renderedBundle = await renderCmxBundle({
      bundle,
      outDir,
      unsupportedValues: input.unsupportedValues,
    });

    if (input.entries) {
      return {
        ...renderedBundle,
        ...bundleResult,
      };
    }

    if (renderedBundle.result === "complete") {
      const renderedEntry = renderedBundle.entries[bundleEntry.name];
      return {
        result: "tree",
        tree: renderedEntry.tree,
        ...(renderedEntry.meta ? { meta: renderedEntry.meta } : {}),
        manifest: renderedEntry.manifest,
        diagnostics: [],
        ...bundleResult,
      };
    }

    return {
      result: "error",
      diagnostics: renderedBundle.diagnostics,
      ...bundleResult,
    };
  } catch (error) {
    if (error instanceof CmxTestbedBuildError) {
      return {
        result: "error",
        diagnostics: [error.diagnostic],
      };
    }
    throw error;
  } finally {
    await build.close();
  }
}

function entryNameFromPath(entryPath: string): string {
  return path.basename(entryPath, path.extname(entryPath));
}

async function writeSourceFiles(
  rootDir: string,
  files: Record<string, string>,
): Promise<void> {
  await Promise.all(
    Object.entries(files).map(async ([relativePath, source]) => {
      const absolutePath = path.join(rootDir, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source, "utf8");
    }),
  );
}

async function readOutputFiles(
  outDir: string,
  fileNames: string[],
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  await Promise.all(
    fileNames.map(async (fileName) => {
      files[fileName] = await readFile(path.join(outDir, fileName), "utf8");
    }),
  );
  return files;
}

async function writeRuntimePackage(outDir: string): Promise<void> {
  const packageDir = path.join(outDir, "node_modules", "@cmx", "runtime");
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    path.join(packageDir, "package.json"),
    `${JSON.stringify(
      {
        name: "@cmx/runtime",
        type: "module",
        exports: {
          "./jsx-runtime": "./jsx-runtime.js",
          "./jsx-dev-runtime": "./jsx-runtime.js",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(packageDir, "jsx-runtime.js"),
    RUNTIME_SOURCE,
    "utf8",
  );
}

class CmxTestbedBuildError extends Error {
  diagnostic: CmxDiagnostic;

  constructor(diagnostic: CmxDiagnostic) {
    super(diagnostic.message);
    this.name = "CmxTestbedBuildError";
    this.diagnostic = diagnostic;
  }
}

function toBuildDiagnostic(error: unknown): CmxDiagnostic {
  const errorRecord = isRecord(error) ? error : {};
  const rawMessage =
    typeof errorRecord.message === "string"
      ? errorRecord.message
      : "CMX bundle build failed.";
  const cmxPluginDiagnostic = cmxPluginDiagnosticFromBuildMessage(rawMessage);
  if (cmxPluginDiagnostic) {
    return cmxPluginDiagnostic;
  }

  const dynamicImportSource = dynamicImportSourceFromBuildMessage(rawMessage);
  if (dynamicImportSource) {
    return {
      severity: "error",
      code: "dynamic-import-unsupported",
      message: "Dynamic imports are not supported in CMX bundles.",
      source: dynamicImportSource,
    };
  }

  const code =
    typeof errorRecord.code === "string" ? errorRecord.code : "cmx-build-error";
  const loc = isRecord(errorRecord.loc) ? errorRecord.loc : undefined;
  const source =
    loc &&
    typeof loc.file === "string" &&
    typeof loc.line === "number" &&
    typeof loc.column === "number"
      ? {
          file: loc.file,
          line: loc.line,
          column: loc.column,
        }
      : undefined;

  return {
    severity: "error",
    code,
    message: rawMessage,
    ...(source ? { source } : {}),
  };
}

function cmxPluginDiagnosticFromBuildMessage(
  message: string,
): CmxDiagnostic | undefined {
  const source = cmxPluginSourceFromBuildMessage(message);
  if (!source) {
    return undefined;
  }

  if (
    message.includes(
      "Namespace imports from configured externals are not supported.",
    )
  ) {
    return {
      severity: "error",
      code: "external-namespace-import-unsupported",
      message: "Namespace imports from configured externals are not supported.",
      source,
    };
  }

  if (
    message.includes(
      "Side-effect-only imports from configured externals are not supported.",
    )
  ) {
    return {
      severity: "error",
      code: "external-side-effect-import-unsupported",
      message:
        "Side-effect-only imports from configured externals are not supported.",
      source,
    };
  }

  if (
    message.includes(
      "Configured external imports must be rendered as JSX components.",
    )
  ) {
    return {
      severity: "error",
      code: "external-component-call-unsupported",
      message:
        "Configured external imports must be rendered as JSX components.",
      source,
    };
  }

  if (
    message.includes(
      "Configured external imports cannot be used as runtime values.",
    )
  ) {
    return {
      severity: "error",
      code: "external-runtime-value-unsupported",
      message: "Configured external imports cannot be used as runtime values.",
      source,
    };
  }

  if (
    message.includes(
      "CMX meta.type could not be extracted. Use a simple type-only import from an external package for exported meta annotations.",
    )
  ) {
    return {
      severity: "error",
      code: "meta-type-unsupported",
      message:
        "CMX meta.type could not be extracted. Use a simple type-only import from an external package for exported meta annotations.",
      source,
    };
  }

  return undefined;
}

function dynamicImportSourceFromBuildMessage(
  message: string,
): CmxDiagnosticSource | undefined {
  if (!message.includes("Dynamic imports are not supported in CMX bundles.")) {
    return undefined;
  }

  return cmxPluginSourceFromBuildMessage(message);
}

function cmxPluginSourceFromBuildMessage(
  message: string,
): CmxDiagnosticSource | undefined {
  const match = /\[plugin cmx\]\s+(.+):(\d+):(\d+)/u.exec(message);
  if (!match?.[1] || !match[2] || !match[3]) {
    return undefined;
  }

  return {
    file: match[1],
    line: Number(match[2]),
    column: Number(match[3]),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const RUNTIME_SOURCE = String.raw`
const RUNTIME_NODE_MARKER_KEY = Symbol.for("cmx.runtime-node-marker");
const externalRefs = new WeakMap();

export const Fragment = Symbol.for("cmx.fragment");

export function __registerExternal(ref) {
  function ExternalReference() {
    throw new Error("External component must be used as JSX.");
  }

  Object.defineProperty(ExternalReference, "__cmxExternalRef", {
    value: true,
  });
  externalRefs.set(ExternalReference, ref);
  return ExternalReference;
}

export function jsx(type, props) {
  return createRuntimeNode(type, props);
}

export function jsxs(type, props) {
  return createRuntimeNode(type, props);
}

function createRuntimeNode(type, props) {
  const inputProps = props ?? {};
  const hasChildren = Object.prototype.hasOwnProperty.call(inputProps, "children");
  const rawChildren = hasChildren ? inputProps.children : undefined;
  const children = hasChildren
    ? Array.isArray(rawChildren)
      ? rawChildren
      : [rawChildren]
    : [];
  const { children: _ignoredChildren, ...rest } = inputProps;

  if (type === Fragment) {
    return markRuntimeNode({ kind: "fragment", children });
  }

  if (typeof type === "string") {
    return markRuntimeNode({
      kind: "element",
      tag: type,
      ...(Object.keys(rest).length > 0 ? { props: rest } : {}),
      ...(children.length > 0 ? { children } : {}),
    });
  }

  if (typeof type === "function") {
    const externalRef = externalRefs.get(type);
    if (externalRef) {
      return markRuntimeNode({
        kind: "component",
        from: externalRef.from,
        import: externalRef.import ?? externalRef.importName,
        ...(Object.keys(rest).length > 0 ? { props: rest } : {}),
        ...(children.length > 0 ? { children } : {}),
      });
    }

    return type(hasChildren ? { ...rest, children: rawChildren } : rest);
  }

  throw new Error("Unsupported JSX element type.");
}

function markRuntimeNode(node) {
  Object.defineProperty(node, RUNTIME_NODE_MARKER_KEY, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  });
  return node;
}
`.trimStart();
