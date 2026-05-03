import type {
  CmxDependency,
  CmxDiagnostic,
  CmxMetaType,
  CmxComponentNode,
  CmxDocument,
  CmxElementNode,
  CmxMeta,
  CmxNode,
  SlotPath,
} from "cmx-contracts";
import { CMX_DOCUMENT_VERSION } from "cmx-contracts";

export const CMX_DOCUMENT_SCHEMA =
  "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json";

export type RuntimeNode = {
  kind: "fragment" | "element" | "component";
  tag?: string;
  from?: string;
  import?: string;
  props?: Record<string, unknown>;
  children?: unknown[];
};

export type RuntimeProtocol = {
  isRuntimeNode(value: unknown): value is RuntimeNode;
};

export type RenderCmxDocumentResult = {
  document: CmxDocument;
};

export type CmxRenderDiagnostic = CmxDiagnostic & {
  code:
    | "invalid-runtime-output"
    | "invalid-runtime-protocol"
    | "render-error"
    | "runtime-protocol-unavailable"
    | "undefined-value"
    | "unsupported-value";
};

export type UnsupportedValuesPolicy = "error" | "omit";

type KeepResult = { keep: true; value: unknown };
type DropResult = { keep: false };
type RenderContext = {
  unsupportedValues: UnsupportedValuesPolicy;
  runtime: RuntimeProtocol;
  dependencies: CmxDependency[];
  usedDependencyNames: Set<string>;
  metaType?: CmxMetaType;
};

export type RenderCmxDocumentInput = {
  moduleUrl: string | URL;
  runtime?: RuntimeProtocol;
  unsupportedValues?: UnsupportedValuesPolicy;
  dependencies?: CmxDependency[];
  metaType?: CmxMetaType;
};

export class CmxRenderError extends Error {
  diagnostic: CmxRenderDiagnostic;

  constructor(diagnostic: CmxRenderDiagnostic) {
    super(diagnostic.message);
    this.name = "CmxRenderError";
    this.diagnostic = diagnostic;
  }
}

export async function renderCmxDocument(
  input: RenderCmxDocumentInput,
): Promise<RenderCmxDocumentResult> {
  const bundleModule = (await import(
    /* @vite-ignore */ toModuleUrl(input.moduleUrl)
  )) as Record<string, unknown>;

  if (!Object.prototype.hasOwnProperty.call(bundleModule, "default")) {
    throw new Error("CMX bundle module has no default export.");
  }

  const exportedDefault = bundleModule.default;
  const root =
    typeof exportedDefault === "function" ? exportedDefault() : exportedDefault;
  const context = createRenderContext({
    ...input,
    runtime: input.runtime ?? (await loadDefaultRuntimeProtocol()),
  });
  const tree = await normalizeCmxNodeValue(root, "default export", context);
  const meta = await normalizeMeta(bundleModule, context);

  return {
    document: {
      $schema: CMX_DOCUMENT_SCHEMA,
      cmxVersion: CMX_DOCUMENT_VERSION,
      dependencies: context.dependencies.filter((dependency) =>
        context.usedDependencyNames.has(dependency.name),
      ),
      ...(meta ? { meta } : {}),
      tree,
    },
  };
}

async function normalizeCmxNodeValue(
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
          normalizeCmxNodeValue(child, `${pathLabel}[${index}]`, context),
        ),
      ),
    };
  }

  if (!context.runtime.isRuntimeNode(resolvedValue)) {
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
    registerDependencyRef(node.from, context);
    const output: CmxComponentNode = {
      type: "component",
      from: node.from ?? "",
      ...(node.import ? { import: node.import } : {}),
    };
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

  if (context.runtime.isRuntimeNode(resolvedValue)) {
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

  return [await normalizeCmxNodeValue(resolvedValue, pathLabel, context)];
}

async function normalizeMeta(
  module: Record<string, unknown>,
  context: RenderContext,
): Promise<CmxMeta | undefined> {
  if (!Object.prototype.hasOwnProperty.call(module, "meta")) {
    return undefined;
  }

  const slots: SlotPath[] = [];
  const result = await normalizeMetaValue(
    module.meta,
    "meta",
    [],
    slots,
    context,
  );
  if (!result.keep) {
    return undefined;
  }

  if (context.metaType) {
    registerDependencyRef(context.metaType.from, context);
  }

  return {
    ...(context.metaType ? { type: context.metaType } : {}),
    data: result.value,
    ...(slots.length > 0 ? { slots } : {}),
  };
}

async function normalizeMetaValue(
  value: unknown,
  pathLabel: string,
  path: SlotPath,
  slots: SlotPath[],
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

  if (context.runtime.isRuntimeNode(resolvedValue)) {
    slots.push(path);
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
  runtime: RuntimeProtocol;
  unsupportedValues?: UnsupportedValuesPolicy;
  dependencies?: CmxDependency[];
  metaType?: CmxMetaType;
}): RenderContext {
  return {
    runtime: options.runtime,
    unsupportedValues: options.unsupportedValues ?? "error",
    dependencies: options.dependencies ?? [],
    usedDependencyNames: new Set(),
    ...(options.metaType ? { metaType: options.metaType } : {}),
  };
}

function registerDependencyRef(
  from: string | undefined,
  context: RenderContext,
): void {
  if (!from) {
    return;
  }

  const packageName = packageNameFromImportRef(from);
  if (
    packageName &&
    context.dependencies.some((dependency) => dependency.name === packageName)
  ) {
    context.usedDependencyNames.add(packageName);
  }
}

function packageNameFromImportRef(from: string): string | undefined {
  const [first, second] = from.split("/");
  if (!first) {
    return undefined;
  }

  if (first.startsWith("@")) {
    return second ? `${first}/${second}` : undefined;
  }

  return first;
}

async function loadDefaultRuntimeProtocol(): Promise<RuntimeProtocol> {
  const runtime = (await import("cmx-runtime")) as Record<string, unknown>;
  if (typeof runtime.isRuntimeNode !== "function") {
    throw new Error("CMX runtime protocol does not export isRuntimeNode.");
  }

  return {
    isRuntimeNode: runtime.isRuntimeNode as RuntimeProtocol["isRuntimeNode"],
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
