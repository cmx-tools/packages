import { build, type Plugin } from "esbuild";
import { pathToFileURL } from "node:url";

import { virtualFsPlugin } from "./virtual-fs-plugin.js";

const JSX_RUNTIME_MODULE_ID = "cmx:jsx-runtime";

export type CmxNode =
  | null
  | boolean
  | number
  | string
  | {
      type: "fragment";
      children?: CmxNode[];
    }
  | {
      type: "element";
      tag: string;
      props?: Record<string, unknown>;
      children?: CmxNode[];
    };

export type Diagnostic = { message: string };

export type TranspileSuccessResult = {
  kind: "success";
  tree: CmxNode;
  meta: unknown;
  manifest: { externals: unknown[] };
  diagnostics: Diagnostic[];
};

export type TranspileErrorResult = {
  kind: "error";
  diagnostics: Diagnostic[];
};

export type TranspileModuleResult = TranspileSuccessResult | TranspileErrorResult;

export type FileSystem = {
  readFile(filePath: string): Promise<string | undefined> | string | undefined;
};

export type TranspileModuleInput = {
  entryFile: string;
  fs?: FileSystem;
  unsupportedValues?: UnsupportedValuesPolicy;
};

type RuntimeNode = {
  __cmxRuntimeNode: true;
  kind: "fragment" | "element";
  tag?: string;
  props?: Record<string, unknown>;
  children?: unknown[];
};

type UnsupportedValuesPolicy = "error" | "omit";

type SerializeOptions = {
  unsupportedValues: UnsupportedValuesPolicy;
};

function diagnosticsFromError(error: unknown): Diagnostic[] {
  const message = error instanceof Error ? error.message : String(error);
  return [{ message }];
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function flattenChildren(input: unknown[], output: unknown[]): void {
  for (const entry of input) {
    if (Array.isArray(entry)) {
      flattenChildren(entry, output);
      continue;
    }

    if (entry === null || entry === false || entry === true) {
      continue;
    }

    output.push(entry);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isRuntimeNode(value: unknown): value is RuntimeNode {
  if (typeof value !== "object" || value === null || !("__cmxRuntimeNode" in value)) {
    return false;
  }

  const maybeRuntime = value as RuntimeNode;
  return (
    maybeRuntime.__cmxRuntimeNode === true &&
    (maybeRuntime.kind === "fragment" || maybeRuntime.kind === "element")
  );
}

function unsupportedProp(pathLabel: string, options: SerializeOptions): { keep: false } {
  if (options.unsupportedValues === "omit") {
    return { keep: false };
  }

  throw new Error(`Unsupported prop value at ${pathLabel}`);
}

function serializePropValue(
  value: unknown,
  pathLabel: string,
  options: SerializeOptions
): { keep: true; value: unknown } | { keep: false } {
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
      const item = serializePropValue(value[index], `${pathLabel}[${index}]`, options);
      if (item.keep) {
        normalized.push(item.value);
      }
    }

    return { keep: true, value: normalized };
  }

  if (isRuntimeNode(value)) {
    return { keep: true, value: toCmx(value, pathLabel, options) };
  }

  if (!isPlainObject(value)) {
    return unsupportedProp(pathLabel, options);
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const result = serializePropValue(nestedValue, `${pathLabel}.${key}`, options);
    if (result.keep) {
      normalized[key] = result.value;
    }
  }

  return { keep: true, value: normalized };
}

function serializeProps(
  value: Record<string, unknown>,
  pathLabel: string,
  options: SerializeOptions
): Record<string, unknown> | undefined {
  const normalized: Record<string, unknown> = {};
  for (const [key, propValue] of Object.entries(value)) {
    const result = serializePropValue(propValue, `${pathLabel}.${key}`, options);
    if (result.keep) {
      normalized[key] = result.value;
    }
  }

  if (Object.keys(normalized).length === 0) {
    return undefined;
  }

  return normalized;
}

function toCmx(value: unknown, pathLabel: string, options: SerializeOptions): CmxNode {
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
      children: flattened.map((child, index) => toCmx(child, `${pathLabel}[${index}]`, options))
    };
  }

  if (!isRuntimeNode(value)) {
    throw new Error(`${pathLabel} is not CMX runtime output`);
  }

  const runtimeNode = value;

  if (runtimeNode.kind === "fragment") {
    if (!Array.isArray(runtimeNode.children) || runtimeNode.children.length === 0) {
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
        toCmx(child, `${pathLabel}.children[${index}]`, options)
      )
    };
  }

  const output: Extract<CmxNode, { type: "element" }> = {
    type: "element",
    tag: runtimeNode.tag ?? ""
  };

  if (runtimeNode.props && Object.keys(runtimeNode.props).length > 0) {
    const normalizedProps = serializeProps(runtimeNode.props, `${pathLabel}.props`, options);
    if (normalizedProps) {
      output.props = normalizedProps;
    }
  }

  if (Array.isArray(runtimeNode.children) && runtimeNode.children.length > 0) {
    const flattenedChildren: unknown[] = [];
    flattenChildren(runtimeNode.children, flattenedChildren);
    if (flattenedChildren.length > 0) {
      output.children = flattenedChildren.map((child, index) =>
        toCmx(child, `${pathLabel}.children[${index}]`, options)
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
        namespace: "cmx-runtime"
      }));

      pluginBuild.onLoad({ filter: /^cmx:jsx-runtime$/, namespace: "cmx-runtime" }, () => ({
        loader: "js",
        contents: [
          "const Fragment = Symbol.for('cmx.fragment');",
          "function normalizeChildren(hasChildren, children) {",
          "  if (!hasChildren) return [];",
          "  if (Array.isArray(children)) return children;",
          "  return [children];",
          "}",
          "function createNode(kind, tag, props, children) {",
          "  const node = { __cmxRuntimeNode: true, kind };",
          "  if (tag !== undefined) node.tag = tag;",
          "  if (props && Object.keys(props).length > 0) node.props = props;",
          "  if (children.length > 0) node.children = children;",
          "  return node;",
          "}",
          "function render(type, props) {",
          "  const inputProps = props ?? {};",
          "  const hasChildren = Object.prototype.hasOwnProperty.call(inputProps, 'children');",
          "  const children = normalizeChildren(hasChildren, inputProps.children);",
          "  const { children: _ignoredChildren, ...rest } = inputProps;",
          "  if (type === Fragment) return createNode('fragment', undefined, undefined, children);",
          "  if (typeof type === 'string') return createNode('element', type, rest, children);",
          "  if (typeof type === 'function') {",
          "    const componentProps = children.length > 0 ? { ...rest, children } : rest;",
          "    return type(componentProps);",
          "  }",
          "  throw new Error('Unsupported JSX element type');",
          "}",
          "export { Fragment };",
          "export const jsx = render;",
          "export const jsxs = render;"
        ].join("\n")
      }));
    }
  };
}

export async function transpileModule(input: TranspileModuleInput): Promise<TranspileModuleResult> {
  try {
    const options: SerializeOptions = {
      unsupportedValues: input.unsupportedValues ?? "error"
    };
    const plugins = input.fs ? [virtualFsPlugin(input.fs), jsxRuntimePlugin()] : [jsxRuntimePlugin()];

    const result = await build({
      absWorkingDir: process.cwd(),
      entryPoints: [input.entryFile],
      bundle: true,
      format: "esm",
      platform: "node",
      write: false,
      jsx: "automatic",
      jsxImportSource: "cmx-internal",
      plugins
    });

    const compiledCode = result.outputFiles?.[0]?.text;
    if (!compiledCode) {
      throw new Error("esbuild did not emit output");
    }

    const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiledCode).toString("base64")}`;
    const compiledModule = (await import(moduleUrl)) as Record<string, unknown>;

    if (!hasOwn(compiledModule, "default")) {
      throw new Error(`Module ${pathToFileURL(input.entryFile).href} has no default export`);
    }

    const exportedDefault = compiledModule.default;
    const renderedRoot = typeof exportedDefault === "function" ? exportedDefault() : exportedDefault;

    return {
      kind: "success",
      tree: toCmx(renderedRoot, "default export", options),
      meta: hasOwn(compiledModule, "meta") ? compiledModule.meta : null,
      manifest: { externals: [] },
      diagnostics: []
    };
  } catch (error) {
    return {
      kind: "error",
      diagnostics: diagnosticsFromError(error)
    };
  }
}
