import { build, type Plugin } from "esbuild";
import { pathToFileURL } from "node:url";
import { flattenChildren } from "./children-normalization.js";
import {
  externalsPlugin,
  normalizeExternals,
} from "./externals-plugin.js";
import {
  createExternalsManifest,
  type ExternalUsageRef,
} from "./externals-manifest.js";
import { normalizeMeta } from "./meta-normalization.js";
import {
  normalizeProps,
  type UnsupportedValuesPolicy,
} from "./props-policy.js";
import { virtualFsPlugin } from "./virtual-fs-plugin.js";

const JSX_RUNTIME_MODULE_ID = "cmx:jsx-runtime";

export type CmxFragmentNode = {
  type: "fragment";
  children?: CmxNode[];
};

export type CmxElementNode = {
  type: "element";
  tag: string;
  props?: Record<string, unknown>;
  children?: CmxNode[];
};

export type CmxComponentNode = {
  type: "component";
  from: string;
  import?: string;
  props?: Record<string, unknown>;
  children?: CmxNode[];
};

export type CmxNode =
  | null
  | boolean
  | number
  | string
  | CmxFragmentNode
  | CmxElementNode
  | CmxComponentNode;

export type CmxManifestExternal = {
  from: string;
  imports?: string[];
  default?: true;
};

export type CmxManifest = {
  externals: CmxManifestExternal[];
};

export type Diagnostic = { message: string };

export type TranspileSuccessResult = {
  kind: "success";
  tree: CmxNode;
  meta: unknown;
  manifest: CmxManifest;
  diagnostics: Diagnostic[];
};

export type TranspileErrorResult = {
  kind: "error";
  diagnostics: Diagnostic[];
};

export type TranspileModuleResult =
  | TranspileSuccessResult
  | TranspileErrorResult;

export type { UnsupportedValuesPolicy } from "./props-policy.js";

export type FileSystem = {
  readFile(filePath: string): Promise<string | undefined> | string | undefined;
};

export type TranspileModuleInput = {
  entryFile: string;
  fs?: FileSystem;
  externals?: string[];
  unsupportedValues?: UnsupportedValuesPolicy;
};

type RuntimeNode = {
  __cmxRuntimeNode: true;
  kind: "fragment" | "element" | "component";
  tag?: string;
  from?: string;
  import?: string;
  props?: Record<string, unknown>;
  children?: unknown[];
};

type SerializeOptions = {
  unsupportedValues: UnsupportedValuesPolicy;
  onExternalRefUsed(ref: ExternalUsageRef): void;
};

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export async function transpileModule(
  input: TranspileModuleInput,
): Promise<TranspileModuleResult> {
  try {
    const usedExternalRefs: ExternalUsageRef[] = [];
    const options: SerializeOptions = {
      unsupportedValues: input.unsupportedValues ?? "error",
      onExternalRefUsed(ref) {
        usedExternalRefs.push(ref);
      },
    };
    const externals = normalizeExternals(input.externals ?? []);
    const plugins = input.fs
      ? [
          externalsPlugin({ externals, fs: input.fs }),
          virtualFsPlugin(input.fs),
          jsxRuntimePlugin(),
        ]
      : [externalsPlugin({ externals }), jsxRuntimePlugin()];

    const result = await build({
      absWorkingDir: process.cwd(),
      entryPoints: [input.entryFile],
      bundle: true,
      format: "esm",
      platform: "node",
      write: false,
      jsx: "automatic",
      jsxImportSource: "cmx-internal",
      plugins,
    });

    const compiledCode = result.outputFiles?.[0]?.text;
    if (!compiledCode) {
      throw new Error("esbuild did not emit output");
    }

    const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiledCode).toString("base64")}`;
    const compiledModule = (await import(moduleUrl)) as Record<string, unknown>;

    if (!hasOwn(compiledModule, "default")) {
      throw new Error(
        `Module ${pathToFileURL(input.entryFile).href} has no default export`,
      );
    }

    const exportedDefault = compiledModule.default;
    const renderedRoot =
      typeof exportedDefault === "function"
        ? exportedDefault()
        : exportedDefault;

    if (isPromiseLike(renderedRoot)) {
      throw new Error("Module default export must be synchronous");
    }

    return {
      kind: "success",
      tree: toCmx(renderedRoot, "default export", options),
      meta: normalizeMeta(compiledModule),
      manifest: createExternalsManifest(usedExternalRefs),
      diagnostics: [],
    };
  } catch (error) {
    return {
      kind: "error",
      diagnostics: diagnosticsFromError(error),
    };
  }
}

function diagnosticsFromError(error: unknown): Diagnostic[] {
  const message = error instanceof Error ? error.message : String(error);
  return [{ message }];
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isRuntimeNode(value: unknown): value is RuntimeNode {
  if (
    typeof value !== "object" ||
    value === null ||
    !("__cmxRuntimeNode" in value)
  ) {
    return false;
  }

  const maybeRuntime = value as RuntimeNode;
  return (
    maybeRuntime.__cmxRuntimeNode === true &&
    (maybeRuntime.kind === "fragment" ||
      maybeRuntime.kind === "element" ||
      maybeRuntime.kind === "component")
  );
}

function toCmx(
  value: unknown,
  pathLabel: string,
  options: SerializeOptions,
): CmxNode {
  if (isPromiseLike(value)) {
    throw new Error(`${pathLabel} must be synchronous`);
  }

  if (value === undefined) {
    throw new Error(`${pathLabel} resolved to undefined`);
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const flattened: unknown[] = [];
    flattenChildren(value, flattened);
    return {
      type: "fragment",
      children: flattened.map((child, index) =>
        toCmx(child, `${pathLabel}[${index}]`, options),
      ),
    };
  }

  if (!isRuntimeNode(value)) {
    throw new Error(`${pathLabel} is not CMX runtime output`);
  }

  const runtimeNode = value;

  if (runtimeNode.kind === "fragment") {
    if (
      !Array.isArray(runtimeNode.children) ||
      runtimeNode.children.length === 0
    ) {
      return { type: "fragment" };
    }

    const flattenedChildren: unknown[] = [];
    flattenChildren(runtimeNode.children, flattenedChildren);
    if (flattenedChildren.length === 0) {
      return { type: "fragment" };
    }

    return {
      type: "fragment",
      children: flattenedChildren.map((child, index) =>
        toCmx(child, `${pathLabel}.children[${index}]`, options),
      ),
    };
  }

  const output: Extract<CmxNode, { type: "element" | "component" }> =
    runtimeNode.kind === "element"
      ? {
          type: "element",
          tag: runtimeNode.tag ?? "",
        }
      : {
          type: "component",
          from: runtimeNode.from ?? "",
          ...(runtimeNode.import ? { import: runtimeNode.import } : {}),
        };

  if (runtimeNode.kind === "component") {
    options.onExternalRefUsed({
      from: runtimeNode.from ?? "",
      import: runtimeNode.import,
    });
  }

  if (runtimeNode.props && Object.keys(runtimeNode.props).length > 0) {
    const normalizedProps = normalizeProps(
      runtimeNode.props,
      `${pathLabel}.props`,
      {
        unsupportedValues: options.unsupportedValues,
        isPlainObject,
        isRuntimeNode,
        normalizeRuntimeNode: (runtimeValue, runtimePathLabel) =>
          toCmx(runtimeValue, runtimePathLabel, options),
      },
    );
    if (normalizedProps) {
      output.props = normalizedProps;
    }
  }

  if (Array.isArray(runtimeNode.children) && runtimeNode.children.length > 0) {
    const flattenedChildren: unknown[] = [];
    flattenChildren(runtimeNode.children, flattenedChildren);
    if (flattenedChildren.length > 0) {
      output.children = flattenedChildren.map((child, index) =>
        toCmx(child, `${pathLabel}.children[${index}]`, options),
      );
    }
  }

  return output;
}

function jsxRuntimePlugin(): Plugin {
  return {
    name: "cmx-jsx-runtime",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^cmx-internal\/jsx-runtime$/ }, () => ({
        path: JSX_RUNTIME_MODULE_ID,
        namespace: "cmx-runtime",
      }));

      pluginBuild.onLoad(
        { filter: /^cmx:jsx-runtime$/, namespace: "cmx-runtime" },
        () => ({
          loader: "js",
          contents: [
            "const Fragment = Symbol.for('cmx.fragment');",
            "const externalRefs = new WeakMap();",
            "function normalizeChildren(hasChildren, children) {",
            "  if (!hasChildren) return [];",
            "  if (Array.isArray(children)) return children;",
            "  return [children];",
            "}",
            "function createNode(kind, tag, props, children, extra) {",
            "  const node = { __cmxRuntimeNode: true, kind };",
            "  if (tag !== undefined) node.tag = tag;",
            "  if (extra?.from !== undefined) node.from = extra.from;",
            "  if (extra?.import !== undefined) node.import = extra.import;",
            "  if (props && Object.keys(props).length > 0) node.props = props;",
            "  if (children.length > 0) node.children = children;",
            "  return node;",
            "}",
            "export function __registerExternal(ref) {",
            "  function ExternalReference() {",
            "    throw new Error('External components must be used as JSX tags');",
            "  }",
            "  externalRefs.set(ExternalReference, ref);",
            "  return ExternalReference;",
            "}",
            "function render(type, props) {",
            "  const inputProps = props ?? {};",
            "  const hasChildren = Object.prototype.hasOwnProperty.call(inputProps, 'children');",
            "  const children = normalizeChildren(hasChildren, inputProps.children);",
            "  const { children: _ignoredChildren, ...rest } = inputProps;",
            "  if (type === Fragment) return createNode('fragment', undefined, undefined, children);",
            "  if (typeof type === 'string') return createNode('element', type, rest, children);",
            "  if (typeof type === 'function') {",
            "    const externalRef = externalRefs.get(type);",
            "    if (externalRef) {",
            "      return createNode(",
            "        'component',",
            "        undefined,",
            "        rest,",
            "        children,",
            "        { from: externalRef.from, import: externalRef.importName },",
            "      );",
            "    }",
            "    const componentProps = children.length > 0 ? { ...rest, children } : rest;",
            "    return type(componentProps);",
            "  }",
            "  throw new Error('Unsupported JSX element type');",
            "}",
            "export { Fragment };",
            "export const jsx = render;",
            "export const jsxs = render;",
          ].join("\n"),
        }),
      );
    },
  };
}
