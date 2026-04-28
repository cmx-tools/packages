export type ExternalReference = {
  from: string;
  import?: string;
  importName?: string;
};

export type RuntimeNode = {
  kind: "fragment" | "element" | "component";
  tag?: string;
  from?: string;
  import?: string;
  props?: Record<string, unknown>;
  children?: unknown[];
};

const RUNTIME_NODE_MARKER_KEY = Symbol.for("cmx.runtime-node-marker");
const externalRefs = new WeakMap<Function, ExternalReference>();

export const Fragment = Symbol.for("cmx.fragment");

export function __registerExternal(ref: ExternalReference): Function {
  function ExternalReference() {
    throw new Error("External component must be used as JSX.");
  }

  Object.defineProperty(ExternalReference, "__cmxExternalRef", {
    value: true,
  });
  externalRefs.set(ExternalReference, ref);
  return ExternalReference;
}

export function jsx(
  type: unknown,
  props: Record<string, unknown> | null,
  _key?: unknown,
) {
  return createRuntimeNode(type, props);
}

export function jsxs(
  type: unknown,
  props: Record<string, unknown> | null,
  _key?: unknown,
) {
  return createRuntimeNode(type, props);
}

export function jsxDEV(
  type: unknown,
  props: Record<string, unknown> | null,
  _key?: unknown,
  _isStaticChildren?: boolean,
  _source?: unknown,
  _self?: unknown,
) {
  return createRuntimeNode(type, props);
}

export function isRuntimeNode(value: unknown): value is RuntimeNode {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const runtimeValue = value as RuntimeNode & Record<PropertyKey, unknown>;
  return runtimeValue[RUNTIME_NODE_MARKER_KEY] === true;
}

function createRuntimeNode(
  type: unknown,
  props: Record<string, unknown> | null,
): unknown {
  const inputProps = props ?? {};
  const hasChildren = Object.prototype.hasOwnProperty.call(
    inputProps,
    "children",
  );
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

function markRuntimeNode<T extends RuntimeNode>(node: T): T {
  Object.defineProperty(node, RUNTIME_NODE_MARKER_KEY, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  });
  return node;
}
