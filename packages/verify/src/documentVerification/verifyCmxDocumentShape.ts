import {
  CMX_DOCUMENT_SCHEMA,
  CMX_DOCUMENT_VERSION,
  type SlotPath,
} from "@cmx-tools/contracts";
import {
  type CmxValuePath,
  type CmxVerificationContext,
  isCmxRecord,
  reportCmxDiagnostic,
} from "./CmxVerificationContext.js";

export function verifyCmxDocumentShape(
  document: unknown,
  context: CmxVerificationContext,
): boolean {
  const startDiagnosticCount = context.diagnostics.length;
  const value = document;
  if (!isCmxRecord(value)) {
    reportCmxDiagnostic(
      context,
      "invalid-document",
      [],
      "Document must be an object.",
    );
    return false;
  }

  if (value.$schema !== CMX_DOCUMENT_SCHEMA) {
    reportCmxDiagnostic(
      context,
      "invalid-document",
      ["$schema"],
      "Document schema is unsupported.",
    );
  }
  if (value.cmxVersion !== CMX_DOCUMENT_VERSION) {
    reportCmxDiagnostic(
      context,
      "invalid-document",
      ["cmxVersion"],
      "Document CMX version is unsupported.",
    );
  }

  const documentInterface = value.interface;
  if (!isCmxRecord(documentInterface)) {
    reportCmxDiagnostic(
      context,
      "invalid-document",
      ["interface"],
      "Document Interface must be an object.",
    );
    return false;
  }

  const imports = documentInterface.imports;
  const exports = documentInterface.exports;
  const content = value.content;
  if (!isCmxRecord(imports)) {
    reportCmxDiagnostic(
      context,
      "invalid-document",
      ["interface", "imports"],
      "Document imports must be an object.",
    );
  } else {
    verifyImports(imports, context);
  }
  if (!isCmxRecord(exports)) {
    reportCmxDiagnostic(
      context,
      "invalid-document",
      ["interface", "exports"],
      "Document exports must be an object.",
    );
  } else {
    verifyExports(exports, context);
  }
  if (!isCmxRecord(content)) {
    reportCmxDiagnostic(
      context,
      "invalid-document",
      ["content"],
      "Document content must be an object.",
    );
  }

  if (isCmxRecord(exports) && isCmxRecord(content)) {
    verifyExportContentParity(exports, content, context);
  }

  return context.diagnostics.length === startDiagnosticCount;
}

export function verifyCmxSlotPaths(
  value: unknown,
  path: CmxValuePath,
  context: CmxVerificationContext,
): value is SlotPath[] {
  if (!Array.isArray(value)) {
    reportCmxDiagnostic(
      context,
      "invalid-document",
      path,
      "Slots must be an array of paths.",
    );
    return false;
  }

  let valid = true;
  for (let index = 0; index < value.length; index += 1) {
    const slotPath = value[index];
    const itemPath = [...path, index];
    if (!Array.isArray(slotPath)) {
      reportCmxDiagnostic(
        context,
        "invalid-document",
        itemPath,
        "Slot path must be an array.",
      );
      valid = false;
      continue;
    }
    for (
      let segmentIndex = 0;
      segmentIndex < slotPath.length;
      segmentIndex += 1
    ) {
      const segment = slotPath[segmentIndex];
      if (
        (typeof segment !== "string" && typeof segment !== "number") ||
        (typeof segment === "number" &&
          (!Number.isSafeInteger(segment) || segment < 0))
      ) {
        reportCmxDiagnostic(
          context,
          "invalid-document",
          [...itemPath, segmentIndex],
          "Slot path segment is invalid.",
        );
        valid = false;
      }
    }
  }
  return valid;
}

function verifyImports(
  imports: Record<string, unknown>,
  context: CmxVerificationContext,
): void {
  for (const [name, dependency] of Object.entries(imports)) {
    const path: CmxValuePath = ["interface", "imports", name];
    if (!isCmxRecord(dependency)) {
      reportCmxDiagnostic(
        context,
        "invalid-document",
        path,
        "Document import must be an object.",
      );
      continue;
    }
    if (
      dependency.name !== name ||
      typeof dependency.specifier !== "string" ||
      dependency.specifier.length === 0 ||
      typeof dependency.version !== "string" ||
      dependency.version.length === 0 ||
      (dependency.integrity !== undefined &&
        typeof dependency.integrity !== "string")
    ) {
      reportCmxDiagnostic(
        context,
        "invalid-document",
        path,
        "Document import is invalid.",
      );
    }
  }
}

function verifyExports(
  exports: Record<string, unknown>,
  context: CmxVerificationContext,
): void {
  for (const [name, declaration] of Object.entries(exports)) {
    const path: CmxValuePath = ["interface", "exports", name];
    if (!isCmxRecord(declaration)) {
      reportCmxDiagnostic(
        context,
        "invalid-document",
        path,
        "Document export declaration must be an object.",
      );
      continue;
    }
    if (declaration.type !== undefined) {
      verifyTypeRef(declaration.type, [...path, "type"], context);
    }
    if (declaration.slots !== undefined) {
      verifyCmxSlotPaths(declaration.slots, [...path, "slots"], context);
    }
  }
}

function verifyTypeRef(
  value: unknown,
  path: CmxValuePath,
  context: CmxVerificationContext,
): void {
  if (!isCmxRecord(value)) {
    reportCmxDiagnostic(
      context,
      "invalid-document",
      path,
      "Export type reference must be an object.",
    );
    return;
  }
  if (
    typeof value.from !== "string" ||
    value.from.length === 0 ||
    (value.import !== undefined && typeof value.import !== "string")
  ) {
    reportCmxDiagnostic(
      context,
      "invalid-document",
      path,
      "Export type reference is invalid.",
    );
  }
}

function verifyExportContentParity(
  exports: Record<string, unknown>,
  content: Record<string, unknown>,
  context: CmxVerificationContext,
): void {
  for (const exportName of Object.keys(exports)) {
    if (!Object.hasOwn(content, exportName)) {
      reportCmxDiagnostic(
        context,
        "invalid-document",
        ["content", exportName],
        "Declared export is missing from Document content.",
      );
    }
  }
}
