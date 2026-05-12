import type { CmxDiagnostic, CmxDiagnosticSource } from "@cmx-tools/contracts";

export function toCmxTestbedBuildDiagnostic(error: unknown): CmxDiagnostic {
  const errorRecord = isRecord(error) ? error : {};
  const rawMessage =
    typeof errorRecord.message === "string"
      ? errorRecord.message
      : "CMX bundle build failed.";
  const cmxPluginDiagnostic = cmxPluginDiagnosticFromBuildMessage(rawMessage);
  if (cmxPluginDiagnostic) {
    return cmxPluginDiagnostic;
  }

  const dynamicImportSource = dynamicImportSourceFromBuildMessage(rawMessage);
  if (dynamicImportSource) {
    return {
      severity: "error",
      code: "dynamic-import-unsupported",
      message: "Dynamic imports are not supported in CMX bundles.",
      source: dynamicImportSource,
    };
  }

  const code =
    typeof errorRecord.code === "string" ? errorRecord.code : "cmx-build-error";
  const loc = isRecord(errorRecord.loc) ? errorRecord.loc : undefined;
  const source =
    loc &&
    typeof loc.file === "string" &&
    typeof loc.line === "number" &&
    typeof loc.column === "number"
      ? {
          file: loc.file,
          line: loc.line,
          column: loc.column,
        }
      : undefined;

  return {
    severity: "error",
    code,
    message: rawMessage,
    ...(source ? { source } : {}),
  };
}

function cmxPluginDiagnosticFromBuildMessage(
  message: string,
): CmxDiagnostic | undefined {
  const source = cmxPluginSourceFromBuildMessage(message);

  if (
    message.includes(
      "Namespace imports from configured externals are not supported.",
    )
  ) {
    if (!source) {
      return undefined;
    }
    return {
      severity: "error",
      code: "external-namespace-import-unsupported",
      message: "Namespace imports from configured externals are not supported.",
      source,
    };
  }

  if (
    message.includes(
      "Side-effect-only imports from configured externals are not supported.",
    )
  ) {
    if (!source) {
      return undefined;
    }
    return {
      severity: "error",
      code: "external-side-effect-import-unsupported",
      message:
        "Side-effect-only imports from configured externals are not supported.",
      source,
    };
  }

  if (
    message.includes(
      "Configured external imports must be rendered as JSX components.",
    )
  ) {
    if (!source) {
      return undefined;
    }
    return {
      severity: "error",
      code: "external-component-call-unsupported",
      message:
        "Configured external imports must be rendered as JSX components.",
      source,
    };
  }

  if (
    message.includes(
      "Configured external imports cannot be used as runtime values.",
    )
  ) {
    if (!source) {
      return undefined;
    }
    return {
      severity: "error",
      code: "external-runtime-value-unsupported",
      message: "Configured external imports cannot be used as runtime values.",
      source,
    };
  }

  return undefined;
}

function dynamicImportSourceFromBuildMessage(
  message: string,
): CmxDiagnosticSource | undefined {
  if (!message.includes("Dynamic imports are not supported in CMX bundles.")) {
    return undefined;
  }

  return cmxPluginSourceFromBuildMessage(message);
}

function cmxPluginSourceFromBuildMessage(
  message: string,
): CmxDiagnosticSource | undefined {
  const match = /\[plugin cmx\]\s+(.+):(\d+):(\d+)/u.exec(message);
  if (!match?.[1] || !match[2] || !match[3]) {
    return undefined;
  }

  return {
    file: match[1],
    line: Number(match[2]),
    column: Number(match[3]),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
