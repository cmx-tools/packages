import { isRuntimeNode, type RuntimeNode } from "./jsx.js";

export type CmxFragmentNode = {
  type: "fragment";
  children?: CmxNode[];
};

export type CmxElementNode = {
  type: "element";
  tag: string;
  props?: Record<string, unknown>;
  slots?: SlotPath[];
  children?: CmxNode[];
};

export type CmxComponentNode = {
  type: "component";
  from: string;
  import?: string;
  props?: Record<string, unknown>;
  slots?: SlotPath[];
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

export type CmxRenderDiagnostic = {
  code: "invalid-runtime-output" | "render-error" | "undefined-value";
  message: string;
};

export type SlotPath = Array<string | number>;

type KeepResult = { keep: true; value: unknown };
type DropResult = { keep: false };

export type RenderCmxTreeInput = {
  moduleUrl: string | URL;
};

export class CmxRenderError extends Error {
  diagnostic: CmxRenderDiagnostic;

  constructor(diagnostic: CmxRenderDiagnostic) {
    super(diagnostic.message);
    this.name = "CmxRenderError";
    this.diagnostic = diagnostic;
  }
}

export async function renderCmxTree(
  input: RenderCmxTreeInput,
): Promise<CmxNode> {
  const artifactModule = (await import(
    /* @vite-ignore */ toModuleUrl(input.moduleUrl)
  )) as Record<string, unknown>;

  if (!Object.prototype.hasOwnProperty.call(artifactModule, "default")) {
    throw new Error("CMX artifact module has no default export.");
  }

  const exportedDefault = artifactModule.default;
  const root =
    typeof exportedDefault === "function" ? exportedDefault() : exportedDefault;
  return normalizeCmxTree(root);
}

export async function normalizeCmxTree(value: unknown): Promise<CmxNode> {
  return normalizeCmxTreeValue(value, "default export");
}

async function normalizeCmxTreeValue(
  value: unknown,
  pathLabel: string,
): Promise<CmxNode> {
  const resolvedValue = await value;

  if (resolvedValue === undefined) {
    throw new CmxRenderError({
      code: "undefined-value",
      message: `${pathLabel} resolved to undefined`,
    });
  }

  if (
    resolvedValue === null ||
    typeof resolvedValue === "string" ||
    typeof resolvedValue === "number" ||
    typeof resolvedValue === "boolean"
  ) {
    return resolvedValue;
  }

  if (Array.isArray(resolvedValue)) {
    return {
      type: "fragment",
      children: await Promise.all(
        flattenChildren(resolvedValue).map((child, index) =>
          normalizeCmxTreeValue(child, `${pathLabel}[${index}]`),
        ),
      ),
    };
  }

  if (!isRuntimeNode(resolvedValue)) {
    throw new CmxRenderError({
      code: "invalid-runtime-output",
      message: `${pathLabel} is not CMX runtime output`,
    });
  }

  return normalizeRuntimeNode(resolvedValue, pathLabel);
}

async function normalizeRuntimeNode(
  node: RuntimeNode,
  pathLabel: string,
): Promise<CmxNode> {
  if (node.kind === "fragment") {
    const children = await normalizeChildren(
      node.children,
      `${pathLabel}.children`,
    );
    return children.length > 0
      ? { type: "fragment", children }
      : { type: "fragment" };
  }

  if (node.kind === "component") {
    const output: CmxComponentNode = {
      type: "component",
      from: node.from ?? "",
      ...(node.import ? { import: node.import } : {}),
    };
    return addNodeFields(output, node, pathLabel);
  }

  const output: CmxElementNode = {
    type: "element",
    tag: node.tag ?? "",
  };
  return addNodeFields(output, node, pathLabel);
}

async function addNodeFields<Node extends CmxElementNode | CmxComponentNode>(
  output: Node,
  runtimeNode: RuntimeNode,
  pathLabel: string,
): Promise<Node> {
  if (runtimeNode.props && Object.keys(runtimeNode.props).length > 0) {
    const slots: SlotPath[] = [];
    const props = await normalizeProps(runtimeNode.props, slots);
    if (props) {
      output.props = props;
    }
    if (slots.length > 0) {
      output.slots = slots;
    }
  }

  const children = await normalizeChildren(
    runtimeNode.children,
    `${pathLabel}.children`,
  );
  if (children.length > 0) {
    output.children = children;
  }

  return output;
}

async function normalizeProps(
  props: Record<string, unknown>,
  slots: SlotPath[],
): Promise<Record<string, unknown> | undefined> {
  const normalized: Record<string, unknown> = {};

  for (const [key, propValue] of Object.entries(props)) {
    const result = await normalizePropValue(propValue, [key], slots);
    if (result.keep) {
      normalized[key] = result.value;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

async function normalizePropValue(
  value: unknown,
  path: SlotPath,
  slots: SlotPath[],
): Promise<KeepResult | DropResult> {
  const resolvedValue = await value;

  if (resolvedValue === undefined) {
    return { keep: false };
  }

  if (
    resolvedValue === null ||
    typeof resolvedValue === "string" ||
    typeof resolvedValue === "number" ||
    typeof resolvedValue === "boolean"
  ) {
    return { keep: true, value: resolvedValue };
  }

  if (Array.isArray(resolvedValue)) {
    const normalized: unknown[] = [];
    for (let index = 0; index < resolvedValue.length; index += 1) {
      const result = await normalizePropValue(
        resolvedValue[index],
        [...path, normalized.length],
        slots,
      );
      if (result.keep) {
        normalized.push(result.value);
      }
    }
    return { keep: true, value: normalized };
  }

  if (isRuntimeNode(resolvedValue)) {
    slots.push(path);
    return {
      keep: true,
      value: await normalizeRuntimeNode(resolvedValue, "prop"),
    };
  }

  if (!isPlainObject(resolvedValue)) {
    throw new Error("CMX tree renderer received unsupported prop data.");
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(resolvedValue)) {
    const result = await normalizePropValue(nestedValue, [...path, key], slots);
    if (result.keep) {
      normalized[key] = result.value;
    }
  }

  return { keep: true, value: normalized };
}

async function normalizeChildren(
  children: unknown[] | undefined,
  pathLabel: string,
): Promise<CmxNode[]> {
  if (!children || children.length === 0) {
    return [];
  }

  return Promise.all(
    flattenChildren(children).map((child, index) =>
      normalizeCmxTreeValue(child, `${pathLabel}[${index}]`),
    ),
  );
}

function flattenChildren(children: unknown[]): unknown[] {
  const output: unknown[] = [];
  for (const child of children) {
    if (Array.isArray(child)) {
      output.push(...flattenChildren(child));
      continue;
    }
    output.push(child);
  }
  return output;
}

function toModuleUrl(moduleUrl: string | URL): string {
  return moduleUrl instanceof URL ? moduleUrl.href : moduleUrl;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
