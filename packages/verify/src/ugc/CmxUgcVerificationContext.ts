import type { CmxDiagnostic } from "@cmx-tools/contracts";

export type CmxUgcValuePath = Array<string | number>;

export type CmxUgcVerificationContext = {
  diagnostics: CmxDiagnostic[];
  reported: Set<string>;
};

export function createCmxUgcVerificationContext(): CmxUgcVerificationContext {
  return {
    diagnostics: [],
    reported: new Set(),
  };
}

export function reportCmxUgcDiagnostic(
  context: CmxUgcVerificationContext,
  code: string,
  path: CmxUgcValuePath,
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

function formatPath(path: CmxUgcValuePath): string {
  if (path.length === 0) {
    return "/";
  }
  return `/${path
    .map((segment) =>
      String(segment).replaceAll("~", "~0").replaceAll("/", "~1"),
    )
    .join("/")}`;
}
