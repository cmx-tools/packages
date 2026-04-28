import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import type {
  CmxBundle,
  CmxBundleChunk,
  CmxBundleEntry,
} from "../cmx-bundler/index.js";
import type { CmxDiagnosticSource } from "../CmxDiagnostic.js";
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
  if (input.bundle.runtime.importSource !== RUNTIME_IMPORT_SOURCE) {
    return {
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "runtime-import-source-mismatch",
          message: `CMX bundle targets runtime import source "${input.bundle.runtime.importSource}", but this executor expects "${RUNTIME_IMPORT_SOURCE}".`,
        },
      ],
    };
  }

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

  const renderedEntries = await Promise.all(
    input.bundle.entries.map(async (entry) => {
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
    ...(await sourceFromRuntimeError(error, input)),
  };
}

async function sourceFromRuntimeError(
  error: unknown,
  input: RenderCmxBundleInput,
): Promise<{ source: CmxDiagnosticSource } | Record<string, never>> {
  if (!(error instanceof Error) || !error.stack) {
    return {};
  }

  for (const emittedFile of bundleFiles(input.bundle)) {
    const generatedLocation = generatedLocationFromStack(
      error.stack,
      emittedFile.file,
    );
    if (!generatedLocation) {
      continue;
    }

    const source = await sourceFromSourcemap(
      input.outDir,
      emittedFile.sourcemap,
      generatedLocation,
    );
    if (source) {
      return { source };
    }
  }

  const authoredLocation = authoredLocationFromStack(error.stack);
  if (authoredLocation) {
    return { source: authoredLocation };
  }

  return {};
}

function authoredLocationFromStack(
  stack: string,
): CmxDiagnosticSource | undefined {
  const match = /(?:file:\/\/)?([^\s()]+\.(?:tsx|jsx)):(\d+):(\d+)/u.exec(
    stack,
  );
  if (!match?.[1] || !match[2] || !match[3]) {
    return undefined;
  }

  return {
    file: match[1],
    line: Number(match[2]),
    column: Number(match[3]) - 1,
  };
}

function bundleFiles(
  bundle: CmxBundle,
): Array<CmxBundleEntry | CmxBundleChunk> {
  const files = new Map<string, CmxBundleEntry | CmxBundleChunk>();
  for (const entry of bundle.entries) {
    files.set(entry.file, entry);
  }
  for (const chunk of bundle.chunks) {
    files.set(chunk.file, chunk);
  }
  return [...files.values()];
}

async function sourceFromSourcemap(
  outDir: string,
  sourcemap: string,
  generatedLocation: { line: number; column: number },
): Promise<CmxDiagnosticSource | undefined> {
  let sourcemapSource: string;
  try {
    sourcemapSource = await readFile(path.join(outDir, sourcemap), "utf8");
  } catch {
    return undefined;
  }

  let original: ReturnType<typeof originalPositionFor>;
  try {
    original = originalPositionFor(
      new TraceMap(
        JSON.parse(sourcemapSource) as ConstructorParameters<
          typeof TraceMap
        >[0],
      ),
      generatedLocation,
    );
  } catch {
    return undefined;
  }
  if (!original.source || original.line === null || original.column === null) {
    return undefined;
  }

  return {
    file: path.resolve(outDir, original.source),
    line: original.line,
    column: original.column,
  };
}

function generatedLocationFromStack(
  stack: string,
  fileName: string,
): { line: number; column: number } | undefined {
  const escapedFileName = escapeRegExp(fileName);
  const fileLocationPattern = new RegExp(
    `(?:file://)?[^\\s()]*${escapedFileName}:(\\d+):(\\d+)`,
    "u",
  );
  const match = fileLocationPattern.exec(stack);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  return {
    line: Number(match[1]),
    column: Number(match[2]) - 1,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
