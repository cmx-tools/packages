import { isRuntimeNode, type RuntimeNode } from "./jsx.js";
import type { CmxDiagnostic } from "../CmxDiagnostic.js";

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

export type CmxMeta = {
  type?: CmxMetaTypeRef;
  data: unknown;
};

export type CmxMetaTypeRef = {
  from: string;
  import?: string;
};

export type CmxManifestExternalRef = {
  from: string;
  imports?: string[];
  default?: true;
};

export type CmxManifest = {
  externals: CmxManifestExternalRef[];
};

export type RenderCmxTreeResult = {
  tree: CmxNode;
  meta?: CmxMeta;
  manifest: CmxManifest;
};

export type CmxRenderDiagnostic = CmxDiagnostic & {
  code:
    | "invalid-runtime-output"
    | "render-error"
    | "runtime-import-source-mismatch"
    | "undefined-value"
    | "unsupported-value";
};

export type SlotPath = Array<string | number>;
export type UnsupportedValuesPolicy = "error" | "omit";

type KeepResult = { keep: true; value: unknown };
type DropResult = { keep: false };
type ExternalUsageRef = {
  from: string;
  import?: string;
};
type RenderContext = {
  unsupportedValues: UnsupportedValuesPolicy;
  usedExternalRefs: ExternalUsageRef[];
  metaType?: CmxMetaTypeRef;
};

export type RenderCmxTreeInput = {
  moduleUrl: string | URL;
  unsupportedValues?: UnsupportedValuesPolicy;
  metaType?: CmxMetaTypeRef;
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
): Promise<RenderCmxTreeResult> {
  const artifactModule = (await import(
    /* @vite-ignore */ toModuleUrl(input.moduleUrl)
  )) as Record<string, unknown>;

  if (!Object.prototype.hasOwnProperty.call(artifactModule, "default")) {
    throw new Error("CMX artifact module has no default export.");
  }

  const exportedDefault = artifactModule.default;
  const root =
    typeof exportedDefault === "function" ? exportedDefault() : exportedDefault;
  const context = createRenderContext(input);
  const tree = await normalizeCmxTreeValue(root, "default export", context);
  const meta = await normalizeMeta(artifactModule, context);

  return {
    tree,
    ...(meta ? { meta } : {}),
    manifest: createManifest(context.usedExternalRefs),
  };
}

export async function normalizeCmxTree(value: unknown): Promise<CmxNode> {
  return normalizeCmxTreeValue(
    value,
    "default export",
    createRenderContext({}),
  );
}

async function normalizeCmxTreeValue(
  value: unknown,
  pathLabel: string,
  context: RenderContext,
): Promise<CmxNode> {
  const resolvedValue = await value;

  if (resolvedValue === undefined) {
    throw new CmxRenderError({
      severity: "error",
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
          normalizeCmxTreeValue(child, `${pathLabel}[${index}]`, context),
        ),
      ),
    };
  }

  if (!isRuntimeNode(resolvedValue)) {
    throw new CmxRenderError({
      severity: "error",
      code: "invalid-runtime-output",
      message: `${pathLabel} is not CMX runtime output`,
    });
  }

  return normalizeRuntimeNode(resolvedValue, pathLabel, context);
}

async function normalizeRuntimeNode(
  node: RuntimeNode,
  pathLabel: string,
  context: RenderContext,
): Promise<CmxNode> {
  if (node.kind === "fragment") {
    const children = await normalizeChildren(
      node.children,
      `${pathLabel}.children`,
      context,
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
    context.usedExternalRefs.push({
      from: output.from,
      import: output.import,
    });
    return addNodeFields(output, node, pathLabel, context);
  }

  const output: CmxElementNode = {
    type: "element",
    tag: node.tag ?? "",
  };
  return addNodeFields(output, node, pathLabel, context);
}

async function addNodeFields<Node extends CmxElementNode | CmxComponentNode>(
  output: Node,
  runtimeNode: RuntimeNode,
  pathLabel: string,
  context: RenderContext,
): Promise<Node> {
  if (runtimeNode.props && Object.keys(runtimeNode.props).length > 0) {
    const slots: SlotPath[] = [];
    const props = await normalizeProps(
      runtimeNode.props,
      slots,
      `${pathLabel}.props`,
      context,
    );
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
    context,
  );
  if (children.length > 0) {
    output.children = children;
  }

  return output;
}

async function normalizeProps(
  props: Record<string, unknown>,
  slots: SlotPath[],
  pathLabel: string,
  context: RenderContext,
): Promise<Record<string, unknown> | undefined> {
  const normalized: Record<string, unknown> = {};

  for (const [key, propValue] of Object.entries(props)) {
    const result = await normalizePropValue(
      propValue,
      `${pathLabel}.${key}`,
      [key],
      slots,
      context,
    );
    if (result.keep) {
      normalized[key] = result.value;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

async function normalizePropValue(
  value: unknown,
  pathLabel: string,
  path: SlotPath,
  slots: SlotPath[],
  context: RenderContext,
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
        `${pathLabel}[${index}]`,
        [...path, normalized.length],
        slots,
        context,
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
      value: await normalizeRuntimeNode(resolvedValue, pathLabel, context),
    };
  }

  if (!isPlainObject(resolvedValue)) {
    return unsupportedValue("prop", pathLabel, context);
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(resolvedValue)) {
    const result = await normalizePropValue(
      nestedValue,
      `${pathLabel}.${key}`,
      [...path, key],
      slots,
      context,
    );
    if (result.keep) {
      normalized[key] = result.value;
    }
  }

  return { keep: true, value: normalized };
}

async function normalizeChildren(
  children: unknown[] | undefined,
  pathLabel: string,
  context: RenderContext,
): Promise<CmxNode[]> {
  if (!children || children.length === 0) {
    return [];
  }

  const normalized: CmxNode[] = [];
  for (const child of flattenChildren(children)) {
    normalized.push(
      ...(await normalizeChildValue(
        child,
        `${pathLabel}[${normalized.length}]`,
        context,
      )),
    );
  }
  return normalized;
}

async function normalizeChildValue(
  value: unknown,
  pathLabel: string,
  context: RenderContext,
): Promise<CmxNode[]> {
  const resolvedValue = await value;

  if (Array.isArray(resolvedValue)) {
    const normalized: CmxNode[] = [];
    for (const child of flattenChildren(resolvedValue)) {
      normalized.push(
        ...(await normalizeChildValue(
          child,
          `${pathLabel}[${normalized.length}]`,
          context,
        )),
      );
    }
    return normalized;
  }

  return [await normalizeCmxTreeValue(resolvedValue, pathLabel, context)];
}

async function normalizeMeta(
  module: Record<string, unknown>,
  context: RenderContext,
): Promise<CmxMeta | undefined> {
  if (!Object.prototype.hasOwnProperty.call(module, "meta")) {
    return undefined;
  }

  const result = await normalizeMetaValue(module.meta, "meta", context);
  if (!result.keep) {
    return undefined;
  }

  return {
    ...(context.metaType ? { type: context.metaType } : {}),
    data: result.value,
  };
}

async function normalizeMetaValue(
  value: unknown,
  pathLabel: string,
  context: RenderContext,
): Promise<KeepResult | DropResult> {
  const resolvedValue = await value;

  if (resolvedValue === undefined) {
    return unsupportedValue("meta", pathLabel, context);
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
      const result = await normalizeMetaValue(
        resolvedValue[index],
        `${pathLabel}[${index}]`,
        context,
      );
      if (result.keep) {
        normalized.push(result.value);
      }
    }
    return { keep: true, value: normalized };
  }

  if (isRuntimeNode(resolvedValue)) {
    return {
      keep: true,
      value: await normalizeRuntimeNode(resolvedValue, pathLabel, context),
    };
  }

  if (!isPlainObject(resolvedValue)) {
    return unsupportedValue("meta", pathLabel, context);
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(resolvedValue)) {
    const result = await normalizeMetaValue(
      nestedValue,
      `${pathLabel}.${key}`,
      context,
    );
    if (result.keep) {
      normalized[key] = result.value;
    }
  }

  return { keep: true, value: normalized };
}

function unsupportedValue(
  domain: "meta" | "prop",
  pathLabel: string,
  context: RenderContext,
): DropResult {
  if (context.unsupportedValues === "omit") {
    return { keep: false };
  }

  throw new CmxRenderError({
    severity: "error",
    code: "unsupported-value",
    message: `Unsupported ${domain} value at ${pathLabel}`,
  });
}

function createRenderContext(options: {
  unsupportedValues?: UnsupportedValuesPolicy;
  metaType?: CmxMetaTypeRef;
}): RenderContext {
  return {
    unsupportedValues: options.unsupportedValues ?? "error",
    usedExternalRefs: [],
    ...(options.metaType ? { metaType: options.metaType } : {}),
  };
}

function createManifest(usedRefs: ExternalUsageRef[]): CmxManifest {
  const mergedByModule = new Map<
    string,
    { hasDefault: boolean; imports: Set<string> }
  >();

  for (const ref of usedRefs) {
    const current = mergedByModule.get(ref.from) ?? {
      hasDefault: false,
      imports: new Set<string>(),
    };

    if (ref.import === undefined) {
      current.hasDefault = true;
    } else {
      current.imports.add(ref.import);
    }

    mergedByModule.set(ref.from, current);
  }

  return {
    externals: [...mergedByModule.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([from, entry]) => {
        const manifestEntry: CmxManifestExternalRef = { from };
        const imports = [...entry.imports].sort((left, right) =>
          left.localeCompare(right),
        );
        if (imports.length > 0) {
          manifestEntry.imports = imports;
        }
        if (entry.hasDefault) {
          manifestEntry.default = true;
        }
        return manifestEntry;
      }),
  };
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
