import { pathToFileURL } from "node:url";
import path from "node:path";
import type { CmxArtifact } from "../cmx-bundler/index.js";
import {
  CmxRenderError,
  renderCmxTree,
  type CmxManifest,
  type CmxMeta,
  type CmxNode,
  type CmxRenderDiagnostic,
  type UnsupportedValuesPolicy,
} from "./renderCmxTree.js";

const RUNTIME_IMPORT_SOURCE = "@cmx/runtime";

export type RenderCmxArtifactEntry = {
  result: "tree";
  tree: CmxNode;
  meta?: CmxMeta;
  manifest: CmxManifest;
};

export type RenderCmxArtifactEntryError = {
  result: "error";
  diagnostics: CmxRenderDiagnostic[];
};

export type RenderCmxArtifactEntryResult =
  | RenderCmxArtifactEntry
  | RenderCmxArtifactEntryError;

export type RenderCmxArtifactCompleteResult = {
  result: "complete";
  entries: Record<string, RenderCmxArtifactEntry>;
  diagnostics: [];
};

export type RenderCmxArtifactPartialResult = {
  result: "partial";
  entries: Record<string, RenderCmxArtifactEntryResult>;
  diagnostics: CmxRenderDiagnostic[];
};

export type RenderCmxArtifactErrorResult = {
  result: "error";
  diagnostics: CmxRenderDiagnostic[];
};

export type RenderCmxArtifactResult =
  | RenderCmxArtifactCompleteResult
  | RenderCmxArtifactPartialResult
  | RenderCmxArtifactErrorResult;

export type RenderCmxArtifactInput = {
  artifact: CmxArtifact;
  outDir: string;
  unsupportedValues?: UnsupportedValuesPolicy;
};

export async function renderCmxArtifact(
  input: RenderCmxArtifactInput,
): Promise<RenderCmxArtifactResult> {
  if (input.artifact.runtime.importSource !== RUNTIME_IMPORT_SOURCE) {
    return {
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "runtime-import-source-mismatch",
          message: `CMX artifact targets runtime import source "${input.artifact.runtime.importSource}", but this executor expects "${RUNTIME_IMPORT_SOURCE}".`,
        },
      ],
    };
  }

  if (input.artifact.entries.length === 0) {
    return {
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "render-error",
          message: "CMX artifact has no entries.",
        },
      ],
    };
  }

  const renderedEntries = await Promise.all(
    input.artifact.entries.map(async (entry) => {
      try {
        const rendered = await renderCmxTree({
          moduleUrl: pathToFileURL(path.join(input.outDir, entry.file)),
          metaType: entry.meta?.type,
          unsupportedValues: input.unsupportedValues,
        });
        return [entry.name, { result: "tree", ...rendered }] as const;
      } catch (error) {
        return [
          entry.name,
          {
            result: "error",
            diagnostics: [toRenderDiagnostic(error)],
          },
        ] as const;
      }
    }),
  );

  const entries = Object.fromEntries(renderedEntries) as Record<
    string,
    RenderCmxArtifactEntryResult
  >;
  const diagnostics = renderedEntries.flatMap(([, entry]) =>
    entry.result === "error" ? entry.diagnostics : [],
  );

  if (diagnostics.length === 0) {
    return {
      result: "complete",
      entries: entries as Record<string, RenderCmxArtifactEntry>,
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

function toRenderDiagnostic(error: unknown): CmxRenderDiagnostic {
  if (error instanceof CmxRenderError) {
    return error.diagnostic;
  }

  return {
    severity: "error",
    code: "render-error",
    message: error instanceof Error ? error.message : "Unknown render error.",
  };
}
