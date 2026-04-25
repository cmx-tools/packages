import type { Plugin } from "esbuild";
import { ErrorCode } from "./diagnostics.js";

const JSX_RUNTIME_MODULE_ID = "cmx:jsx-runtime";

const JSX_RUNTIME_CONTENTS = [
  "const Fragment = Symbol.for('cmx.fragment');",
  "const runtimeNodeCheckerKey = Symbol.for('cmx.runtime-node-checker');",
  "const runtimeNodes = new WeakSet();",
  "const externalRefs = new WeakMap();",
  "Object.defineProperty(globalThis, runtimeNodeCheckerKey, {",
  "  configurable: true,",
  "  enumerable: false,",
  "  writable: false,",
  "  value(value) {",
  "    return typeof value === 'object' && value !== null && runtimeNodes.has(value);",
  "  },",
  "});",
  "function normalizeChildren(hasChildren, children) {",
  "  if (!hasChildren) return [];",
  "  if (Array.isArray(children)) return children;",
  "  return [children];",
  "}",
  "function createNode(kind, tag, props, children, extra) {",
  "  const node = { kind };",
  "  runtimeNodes.add(node);",
  "  if (tag !== undefined) node.tag = tag;",
  "  if (extra?.from !== undefined) node.from = extra.from;",
  "  if (extra?.import !== undefined) node.import = extra.import;",
  "  if (props && Object.keys(props).length > 0) node.props = props;",
  "  if (children.length > 0) node.children = children;",
  "  return node;",
  "}",
  "export function __registerExternal(ref) {",
  "  function ExternalReference() {",
  `    throw new Error('[cmx:${ErrorCode.EXTERNAL_COMPONENT_CALLED}] External component must be used as JSX.');`,
  "  }",
  "  Object.defineProperty(ExternalReference, '__cmxExternalRef', { value: true });",
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
  `  throw new Error('[cmx:${ErrorCode.UNSUPPORTED_JSX_ELEMENT_TYPE}] Unsupported JSX element type.');`,
  "}",
  "export { Fragment };",
  "export const jsx = render;",
  "export const jsxs = render;",
].join("\n");

export function jsxRuntimePlugin(): Plugin {
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
          contents: JSX_RUNTIME_CONTENTS,
        }),
      );
    },
  };
}
