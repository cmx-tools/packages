import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { flattenChildren } from "./children-normalization.js";
import { externalsPlugin, normalizeExternals } from "./externals-plugin.js";
import {
  createExternalsManifest,
  type ExternalUsageRef,
} from "./externals-manifest.js";
import { jsxRuntimePlugin } from "./jsx-runtime-plugin.js";
import { normalizeMeta, type CmxMeta } from "./meta-normalization.js";
import {
  diagnosticsFromError,
  type Diagnostic,
  ErrorCode,
  TranspileError,
} from "./diagnostics.js";
import {
  normalizeProps,
  type SlotPath,
  type UnsupportedValuesPolicy,
} from "./props-policy.js";
import { virtualFsPlugin } from "./virtual-fs-plugin.js";

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

export type CmxManifestExternal = {
  from: string;
  imports?: string[];
  default?: true;
};

export type CmxManifest = {
  externals: CmxManifestExternal[];
};

export type TranspileSuccessResult = {
  result: "tree";
  tree: CmxNode;
  meta?: CmxMeta;
  manifest: CmxManifest;
  diagnostics: Diagnostic[];
};

export type TranspileErrorResult = {
  result: "error";
  diagnostics: Diagnostic[];
};

export type TranspileModuleResult =
  | TranspileSuccessResult
  | TranspileErrorResult;

export type { UnsupportedValuesPolicy } from "./props-policy.js";

export type FileSystem = {
  /** Return source text for an absolute module path, or undefined when missing. */
  readFile(filePath: string): Promise<string | undefined> | string | undefined;
};

export type TranspileModuleInput = {
  /** Absolute path to the TSX module that exports the root CMX content. */
  entryFile: string;
  /** Optional virtual file system used instead of reading modules from disk. */
  fs?: FileSystem;
  /** Module specifiers or glob patterns to keep as external CMX components. */
  externals?: string[];
  /** How to handle values that cannot be represented in CMX output. */
  unsupportedValues?: UnsupportedValuesPolicy;
};

type RuntimeNode = {
  kind: "fragment" | "element" | "component";
  tag?: string;
  from?: string;
  import?: string;
  props?: Record<string, unknown>;
  children?: unknown[];
};

const RUNTIME_NODE_MARKER_KEY = Symbol.for("cmx.runtime-node-marker");

let dataUrlImportNonce = 0;

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
      throw new TranspileError(
        ErrorCode.BUILD_NO_OUTPUT,
        "esbuild did not emit output",
      );
    }

    const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiledCode).toString("base64")}#${++dataUrlImportNonce}`;
    const compiledModule = (await import(moduleUrl)) as Record<string, unknown>;

    if (!hasOwn(compiledModule, "default")) {
      throw new TranspileError(
        ErrorCode.MISSING_DEFAULT_EXPORT,
        `Module ${pathToFileURL(input.entryFile).href} has no default export`,
      );
    }

    const exportedDefault = compiledModule.default;
    const renderedRoot =
      typeof exportedDefault === "function"
        ? exportedDefault()
        : exportedDefault;
    const resolvedRoot = await resolveMaybePromise(
      renderedRoot,
      ErrorCode.ASYNC_DEFAULT_EXPORT,
      "Module default export threw while awaiting async result",
    );

    const meta = await normalizeMeta(compiledModule, {
      unsupportedValues: options.unsupportedValues,
      isPlainObject,
      isRuntimeNode,
      isExternalRuntimeValue,
      normalizeRuntimeNode: (runtimeValue, runtimePathLabel) =>
        toCmx(runtimeValue, runtimePathLabel, options),
    });

    return {
      result: "tree",
      tree: await toCmx(resolvedRoot, "default export", options),
      ...(meta ? { meta } : {}),
      manifest: createExternalsManifest(usedExternalRefs),
      diagnostics: [],
    };
  } catch (error) {
    return {
      result: "error",
      diagnostics: diagnosticsFromError(error),
    };
  }
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
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const maybeRuntime = value as RuntimeNode & Record<PropertyKey, unknown>;
  if (maybeRuntime[RUNTIME_NODE_MARKER_KEY] !== true) {
    return false;
  }

  return (
    maybeRuntime.kind === "fragment" ||
    maybeRuntime.kind === "element" ||
    maybeRuntime.kind === "component"
  );
}

function isExternalRuntimeValue(value: unknown): boolean {
  return (
    typeof value === "function" &&
    "__cmxExternalRef" in value &&
    (value as { __cmxExternalRef?: unknown }).__cmxExternalRef === true
  );
}

async function toCmx(
  value: unknown,
  pathLabel: string,
  options: SerializeOptions,
): Promise<CmxNode> {
  const resolvedValue = await resolveMaybePromise(
    value,
    ErrorCode.ASYNC_VALUE,
    `${pathLabel} async evaluation rejected`,
  );

  if (resolvedValue === undefined) {
    throw new TranspileError(
      ErrorCode.UNDEFINED_VALUE,
      `${pathLabel} resolved to undefined`,
    );
  }

  if (isExternalRuntimeValue(resolvedValue)) {
    throw new TranspileError(
      ErrorCode.EXTERNAL_RUNTIME_VALUE,
      "External import used as runtime value.",
    );
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
    const flattened: unknown[] = [];
    flattenChildren(resolvedValue, flattened);
    const children = await Promise.all(
      flattened.map((child, index) =>
        toCmx(child, `${pathLabel}[${index}]`, options),
      ),
    );
    return {
      type: "fragment",
      children,
    };
  }

  if (!isRuntimeNode(resolvedValue)) {
    throw new TranspileError(
      ErrorCode.INVALID_RUNTIME_OUTPUT,
      `${pathLabel} is not CMX runtime output`,
    );
  }

  const runtimeNode = resolvedValue;

  if (runtimeNode.kind === "fragment") {
    if (
      !Array.isArray(runtimeNode.children) ||
      runtimeNode.children.length === 0
    ) {
      return { type: "fragment" };
    }

    const resolvedChildren = await Promise.all(
      runtimeNode.children.map((child, index) =>
        resolveMaybePromise(
          child,
          ErrorCode.ASYNC_VALUE,
          `${pathLabel}.children[${index}] async evaluation rejected`,
        ),
      ),
    );
    const flattenedChildren: unknown[] = [];
    flattenChildren(resolvedChildren, flattenedChildren);
    if (flattenedChildren.length === 0) {
      return { type: "fragment" };
    }

    return {
      type: "fragment",
      children: await Promise.all(
        flattenedChildren.map((child, index) =>
          toCmx(child, `${pathLabel}.children[${index}]`, options),
        ),
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
    const slots: SlotPath[] = [];
    const normalizedProps = await normalizeProps(
      runtimeNode.props,
      `${pathLabel}.props`,
      {
        unsupportedValues: options.unsupportedValues,
        isPlainObject,
        isRuntimeNode,
        isExternalRuntimeValue,
        normalizeRuntimeNode: (runtimeValue, runtimePathLabel) =>
          toCmx(runtimeValue, runtimePathLabel, options),
        onRuntimeNodePath(propPath) {
          slots.push(propPath);
        },
      },
    );
    if (normalizedProps) {
      output.props = normalizedProps;
    }
    if (slots.length > 0) {
      output.slots = slots;
    }
  }

  if (Array.isArray(runtimeNode.children) && runtimeNode.children.length > 0) {
    const resolvedChildren = await Promise.all(
      runtimeNode.children.map((child, index) =>
        resolveMaybePromise(
          child,
          ErrorCode.ASYNC_VALUE,
          `${pathLabel}.children[${index}] async evaluation rejected`,
        ),
      ),
    );
    const flattenedChildren: unknown[] = [];
    flattenChildren(resolvedChildren, flattenedChildren);
    if (flattenedChildren.length > 0) {
      output.children = await Promise.all(
        flattenedChildren.map((child, index) =>
          toCmx(child, `${pathLabel}.children[${index}]`, options),
        ),
      );
    }
  }

  return output;
}

async function resolveMaybePromise(
  value: unknown,
  code: ErrorCode,
  rejectedMessage: string,
): Promise<unknown> {
  if (!isPromiseLike(value)) {
    return value;
  }

  try {
    return await value;
  } catch {
    throw new TranspileError(code, rejectedMessage);
  }
}
