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
};

type RuntimeNode = {
  __cmxRuntimeNode: true;
  kind: "fragment" | "element";
  tag?: string;
  props?: Record<string, unknown>;
  children?: unknown[];
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

function toCmx(value: unknown, pathLabel: string): CmxNode {
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
      children: flattened.map((child, index) => toCmx(child, `${pathLabel}[${index}]`))
    };
  }

  if (typeof value !== "object" || value === null || !("__cmxRuntimeNode" in value)) {
    throw new Error(`${pathLabel} is not CMX runtime output`);
  }

  const runtimeNode = value as RuntimeNode;
  if (runtimeNode.__cmxRuntimeNode !== true) {
    throw new Error(`${pathLabel} is not CMX runtime output`);
  }

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
        toCmx(child, `${pathLabel}.children[${index}]`)
      )
    };
  }

  const output: Extract<CmxNode, { type: "element" }> = {
    type: "element",
    tag: runtimeNode.tag ?? ""
  };

  if (runtimeNode.props && Object.keys(runtimeNode.props).length > 0) {
    output.props = runtimeNode.props;
  }

  if (Array.isArray(runtimeNode.children) && runtimeNode.children.length > 0) {
    const flattenedChildren: unknown[] = [];
    flattenChildren(runtimeNode.children, flattenedChildren);
    if (flattenedChildren.length > 0) {
      output.children = flattenedChildren.map((child, index) =>
        toCmx(child, `${pathLabel}.children[${index}]`)
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
      tree: toCmx(renderedRoot, "default export"),
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
