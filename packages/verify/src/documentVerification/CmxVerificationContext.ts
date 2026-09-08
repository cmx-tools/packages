import type { CmxDiagnostic } from "@cmx-tools/contracts";

export type CmxValuePath = Array<string | number>;

export type CmxVerificationContext = {
  diagnostics: CmxDiagnostic[];
  reported: Set<string>;
};

export function createCmxVerificationContext(): CmxVerificationContext {
  return {
    diagnostics: [],
    reported: new Set(),
  };
}

export function reportCmxDiagnostic(
  context: CmxVerificationContext,
  code: string,
  path: CmxValuePath,
  message: string,
): void {
  const formattedPath = formatPath(path);
  const key = `${code}:${formattedPath}`;
  if (context.reported.has(key)) {
    return;
  }
  context.reported.add(key);
  context.diagnostics.push({
    severity: "error",
    code,
    message: `${message} Path: ${formattedPath}.`,
  });
}

export function isCmxRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return true;
}

function formatPath(path: CmxValuePath): string {
  if (path.length === 0) {
    return "/";
  }
  return `/${path
    .map((segment) =>
      String(segment).replaceAll("~", "~0").replaceAll("/", "~1"),
    )
    .join("/")}`;
}
