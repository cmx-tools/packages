import type { CmxDependency } from "./cmxDependency.js";
import type { CmxDocument } from "./cmxDocument.js";
import { CMX_DOCUMENT_VERSION } from "./cmxDocument.js";
import type { CmxEnvironment } from "./cmxEnvironment.js";

export type CmxDocumentEnvironmentVerificationDiagnostic = {
  severity: "error";
  code:
    | "unsupported-cmx-version"
    | "missing-environment-dependency"
    | "dependency-version-mismatch"
    | "dependency-integrity-mismatch"
    | "meta-type-mismatch";
  message: string;
  dependency?: string;
};

export type CmxDocumentEnvironmentVerificationResult =
  | {
      valid: true;
    }
  | {
      valid: false;
      diagnostics: CmxDocumentEnvironmentVerificationDiagnostic[];
    };

export function verifyCmxDocumentEnvironment(
  document: CmxDocument,
  environment: CmxEnvironment,
): CmxDocumentEnvironmentVerificationResult {
  const diagnostics: CmxDocumentEnvironmentVerificationDiagnostic[] = [];

  if (document.cmxVersion !== CMX_DOCUMENT_VERSION) {
    diagnostics.push({
      severity: "error",
      code: "unsupported-cmx-version",
      message: `Unsupported CMX document version ${String(document.cmxVersion)}.`,
    });
  }

  const environmentDependencies = new Map(
    environment.dependencies.map((dependency) => [dependency.name, dependency]),
  );

  for (const documentDependency of document.dependencies) {
    const environmentDependency = environmentDependencies.get(
      documentDependency.name,
    );

    diagnostics.push(
      ...verifyDependency(documentDependency, environmentDependency),
    );
  }

  const metaDiagnostic = verifyMetaType(document.meta, environment);
  if (metaDiagnostic) {
    diagnostics.push(metaDiagnostic);
  }

  return diagnostics.length === 0
    ? { valid: true }
    : { valid: false, diagnostics };
}

function verifyDependency(
  documentDependency: CmxDependency,
  environmentDependency: CmxDependency | undefined,
): CmxDocumentEnvironmentVerificationDiagnostic[] {
  if (!environmentDependency) {
    return [
      {
        severity: "error",
        code: "missing-environment-dependency",
        message: `Environment dependency ${documentDependency.name} is missing.`,
        dependency: documentDependency.name,
      },
    ];
  }

  const diagnostics: CmxDocumentEnvironmentVerificationDiagnostic[] = [];

  if (documentDependency.version !== environmentDependency.version) {
    diagnostics.push({
      severity: "error",
      code: "dependency-version-mismatch",
      message: `Environment dependency ${documentDependency.name} has version ${environmentDependency.version}, expected ${documentDependency.version}.`,
      dependency: documentDependency.name,
    });
  }

  if (documentDependency.integrity !== environmentDependency.integrity) {
    diagnostics.push({
      severity: "error",
      code: "dependency-integrity-mismatch",
      message: `Environment dependency ${documentDependency.name} integrity does not match.`,
      dependency: documentDependency.name,
    });
  }

  return diagnostics;
}

function verifyMetaType(
  documentMeta: CmxDocument["meta"],
  environment: CmxEnvironment,
): CmxDocumentEnvironmentVerificationDiagnostic | undefined {
  if (!documentMeta) {
    return undefined;
  }

  const documentMetaType = documentMeta.type;
  const environmentMetaType = environment.metaType;

  if (!documentMetaType && !environmentMetaType) {
    return undefined;
  }

  if (
    documentMetaType &&
    environmentMetaType &&
    documentMetaType.from === environmentMetaType.from &&
    documentMetaType.import === environmentMetaType.import
  ) {
    return undefined;
  }

  return {
    severity: "error",
    code: "meta-type-mismatch",
    message: "Document meta type is not compatible with the environment.",
  };
}
