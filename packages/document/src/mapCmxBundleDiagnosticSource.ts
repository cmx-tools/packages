import { readFile } from "node:fs/promises";
import path from "node:path";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import type {
  CmxBundle,
  CmxBundleChunk,
  CmxDiagnosticSource,
  CmxBundleEntry,
} from "@cmx-tools/contracts";

export async function mapCmxBundleDiagnosticSource(input: {
  error: unknown;
  bundle: CmxBundle;
  bundleDir: string;
}): Promise<{ source: CmxDiagnosticSource } | Record<string, never>> {
  const error = input.error;
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
      input.bundleDir,
      emittedFile.sourcemap,
      generatedLocation,
    );
    if (source) {
      return { source };
    }
  }

  return {};
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
  bundleDir: string,
  sourcemap: string,
  generatedLocation: { line: number; column: number },
): Promise<CmxDiagnosticSource | undefined> {
  let sourcemapSource: string;
  try {
    sourcemapSource = await readFile(path.join(bundleDir, sourcemap), "utf8");
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
    file: path.resolve(bundleDir, original.source),
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
