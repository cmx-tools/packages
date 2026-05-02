import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  CMX_BUNDLE_FILE_NAME,
  parseCmxBundleJson,
  type CmxBundle,
  type CmxDocument,
} from "cmx-contracts";
import { mapCmxBundleDiagnosticSource } from "./mapCmxBundleDiagnosticSource.js";
import {
  CmxRenderError,
  renderCmxDocument,
  type CmxRenderDiagnostic,
  type RuntimeProtocol,
  type UnsupportedValuesPolicy,
} from "./renderCmxDocument.js";

export type RenderCmxDocumentsEntry = {
  result: "document";
  document: CmxDocument;
};

export type RenderCmxDocumentsEntryError = {
  result: "error";
  diagnostics: CmxRenderDiagnostic[];
};

export type RenderCmxDocumentsEntryResult =
  | RenderCmxDocumentsEntry
  | RenderCmxDocumentsEntryError;

export type RenderCmxDocumentsCompleteResult = {
  result: "complete";
  entries: Record<string, RenderCmxDocumentsEntry>;
  diagnostics: [];
};

export type RenderCmxDocumentsPartialResult = {
  result: "partial";
  entries: Record<string, RenderCmxDocumentsEntryResult>;
  diagnostics: CmxRenderDiagnostic[];
};

export type RenderCmxDocumentsErrorResult = {
  result: "error";
  diagnostics: CmxRenderDiagnostic[];
};

export type RenderCmxDocumentsResult =
  | RenderCmxDocumentsCompleteResult
  | RenderCmxDocumentsPartialResult
  | RenderCmxDocumentsErrorResult;

export type RenderCmxDocumentsInput = {
  bundleDir: string;
  unsupportedValues?: UnsupportedValuesPolicy;
};

export async function renderCmxDocuments(
  input: RenderCmxDocumentsInput,
): Promise<RenderCmxDocumentsResult> {
  const bundle = await readCmxBundle(input.bundleDir);

  if (bundle.entries.length === 0) {
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
    bundle.runtime.importSource,
  );
  if (runtimeProtocol.result === "error") {
    return {
      result: "error",
      diagnostics: [runtimeProtocol.diagnostic],
    };
  }

  const context = {
    bundle,
    bundleDir: input.bundleDir,
  };
  const renderedEntries = await Promise.all(
    bundle.entries.map(async (entry) => {
      try {
        const rendered = await renderCmxDocument({
          moduleUrl: pathToFileURL(path.join(input.bundleDir, entry.file)),
          runtime: runtimeProtocol.protocol,
          dependencies: bundle.dependencies,
          metaType: entry.meta?.type,
          unsupportedValues: input.unsupportedValues,
        });
        return [
          entry.name,
          {
            result: "document",
            document: rendered.document,
          },
        ] as const;
      } catch (error) {
        return [
          entry.name,
          {
            result: "error",
            diagnostics: [await toRenderDiagnostic(error, context)],
          },
        ] as const;
      }
    }),
  );

  const entries = Object.fromEntries(renderedEntries) as Record<
    string,
    RenderCmxDocumentsEntryResult
  >;
  const diagnostics = renderedEntries.flatMap(([, entry]) =>
    entry.result === "error" ? entry.diagnostics : [],
  );

  if (diagnostics.length === 0) {
    return {
      result: "complete",
      entries: entries as Record<string, RenderCmxDocumentsEntry>,
      diagnostics: [],
    };
  }

  if (renderedEntries.some(([, entry]) => entry.result === "document")) {
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

async function readCmxBundle(bundleDir: string): Promise<CmxBundle> {
  return parseCmxBundleJson(
    await readFile(path.join(bundleDir, CMX_BUNDLE_FILE_NAME), "utf8"),
  );
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
  input: { bundle: CmxBundle; bundleDir: string },
): Promise<CmxRenderDiagnostic> {
  if (error instanceof CmxRenderError) {
    return error.diagnostic;
  }

  return {
    severity: "error",
    code: "render-error",
    message: error instanceof Error ? error.message : "Unknown render error.",
    ...(await mapCmxBundleDiagnosticSource({
      error,
      bundle: input.bundle,
      bundleDir: input.bundleDir,
    })),
  };
}
