import type {
  CmxDiagnostic,
  CmxDocument,
  CmxVerifyDocument,
} from "@cmx-tools/contracts";

export type ValidateCmxDocumentInput = {
  document: CmxDocument;
  verifyDocument?: CmxVerifyDocument;
};

export type ValidateCmxDocumentResult =
  | {
      result: "valid";
      document: CmxDocument;
    }
  | {
      result: "invalid";
      diagnostics: CmxDiagnostic[];
    };

export async function validateCmxDocument(
  input: ValidateCmxDocumentInput,
): Promise<ValidateCmxDocumentResult> {
  if (input.verifyDocument === undefined) {
    return {
      result: "valid",
      document: input.document,
    };
  }

  try {
    const verification = await input.verifyDocument(input.document);
    if (verification.valid) {
      return {
        result: "valid",
        document: input.document,
      };
    }
    return {
      result: "invalid",
      diagnostics: verification.diagnostics,
    };
  } catch (error) {
    return {
      result: "invalid",
      diagnostics: [createVerifierErrorDiagnostic(error)],
    };
  }
}

function createVerifierErrorDiagnostic(error: unknown): CmxDiagnostic {
  if (error instanceof Error) {
    return {
      severity: "error",
      code: "document-verifier-error",
      message: `Document verifier threw: ${error.message}`,
    };
  }

  return {
    severity: "error",
    code: "document-verifier-error",
    message: "Document verifier threw",
  };
}
