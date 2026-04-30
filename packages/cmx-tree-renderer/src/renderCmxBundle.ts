import { pathToFileURL } from "node:url";
import path from "node:path";
import type { CmxBundle } from "cmx-bundle";
import { mapCmxBundleDiagnosticSource } from "./mapCmxBundleDiagnosticSource.js";
import {
  CmxRenderError,
  renderCmxTree,
  type CmxManifest,
  type CmxMeta,
  type CmxNode,
  type CmxRenderDiagnostic,
  type RuntimeProtocol,
  type UnsupportedValuesPolicy,
} from "./renderCmxTree.js";

export type RenderCmxBundleEntry = {
  result: "tree";
  tree: CmxNode;
  meta?: CmxMeta;
  manifest: CmxManifest;
};

export type RenderCmxBundleEntryError = {
  result: "error";
  diagnostics: CmxRenderDiagnostic[];
};

export type RenderCmxBundleEntryResult =
  | RenderCmxBundleEntry
  | RenderCmxBundleEntryError;

export type RenderCmxBundleCompleteResult = {
  result: "complete";
  entries: Record<string, RenderCmxBundleEntry>;
  diagnostics: [];
};

export type RenderCmxBundlePartialResult = {
  result: "partial";
  entries: Record<string, RenderCmxBundleEntryResult>;
  diagnostics: CmxRenderDiagnostic[];
};

export type RenderCmxBundleErrorResult = {
  result: "error";
  diagnostics: CmxRenderDiagnostic[];
};

export type RenderCmxBundleResult =
  | RenderCmxBundleCompleteResult
  | RenderCmxBundlePartialResult
  | RenderCmxBundleErrorResult;

export type RenderCmxBundleInput = {
  bundle: CmxBundle;
  outDir: string;
  unsupportedValues?: UnsupportedValuesPolicy;
};

export async function renderCmxBundle(
  input: RenderCmxBundleInput,
): Promise<RenderCmxBundleResult> {
  if (input.bundle.entries.length === 0) {
    return {
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "render-error",
          message: "CMX bundle has no entries.",
        },
      ],
    };
  }

  const runtimeProtocol = await loadRuntimeProtocol(
    input.bundle.runtime.importSource,
  );
  if (runtimeProtocol.result === "error") {
    return {
      result: "error",
      diagnostics: [runtimeProtocol.diagnostic],
    };
  }

  const renderedEntries = await Promise.all(
    input.bundle.entries.map(async (entry) => {
      try {
        const rendered = await renderCmxTree({
          moduleUrl: pathToFileURL(path.join(input.outDir, entry.file)),
          runtime: runtimeProtocol.protocol,
          metaType: entry.meta?.type,
          unsupportedValues: input.unsupportedValues,
        });
        return [entry.name, { result: "tree", ...rendered }] as const;
      } catch (error) {
        return [
          entry.name,
          {
            result: "error",
            diagnostics: [await toRenderDiagnostic(error, input)],
          },
        ] as const;
      }
    }),
  );

  const entries = Object.fromEntries(renderedEntries) as Record<
    string,
    RenderCmxBundleEntryResult
  >;
  const diagnostics = renderedEntries.flatMap(([, entry]) =>
    entry.result === "error" ? entry.diagnostics : [],
  );

  if (diagnostics.length === 0) {
    return {
      result: "complete",
      entries: entries as Record<string, RenderCmxBundleEntry>,
      diagnostics: [],
    };
  }

  if (renderedEntries.some(([, entry]) => entry.result === "tree")) {
    return {
      result: "partial",
      entries,
      diagnostics,
    };
  }

  return {
    result: "error",
    diagnostics,
  };
}

type RuntimeProtocolResult =
  | { result: "loaded"; protocol: RuntimeProtocol }
  | { result: "error"; diagnostic: CmxRenderDiagnostic };

async function loadRuntimeProtocol(
  importSource: string,
): Promise<RuntimeProtocolResult> {
  let runtime: Record<string, unknown>;
  try {
    runtime = (await import(/* @vite-ignore */ importSource)) as Record<
      string,
      unknown
    >;
  } catch (error) {
    return {
      result: "error",
      diagnostic: {
        severity: "error",
        code: "runtime-protocol-unavailable",
        message: `CMX runtime protocol could not be loaded from "${importSource}".`,
      },
    };
  }

  if (typeof runtime.isRuntimeNode !== "function") {
    return {
      result: "error",
      diagnostic: {
        severity: "error",
        code: "invalid-runtime-protocol",
        message: `CMX runtime protocol from "${importSource}" does not export isRuntimeNode.`,
      },
    };
  }

  return {
    result: "loaded",
    protocol: {
      isRuntimeNode: runtime.isRuntimeNode as RuntimeProtocol["isRuntimeNode"],
    },
  };
}

async function toRenderDiagnostic(
  error: unknown,
  input: RenderCmxBundleInput,
): Promise<CmxRenderDiagnostic> {
  if (error instanceof CmxRenderError) {
    return error.diagnostic;
  }

  return {
    severity: "error",
    code: "render-error",
    message: error instanceof Error ? error.message : "Unknown render error.",
    ...(await mapCmxBundleDiagnosticSource(error, input)),
  };
}
