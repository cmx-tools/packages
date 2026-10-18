import type { CmxDiagnostic } from "@cmx-tools/contracts";
import { CmxPublicationError } from "./CmxPublicationError.js";
import {
  hashCmxPublicationManifest,
  type CmxPublicationDiagnostics,
  type CmxPublicationState,
} from "./publicationProtocol/index.js";

const hashPattern = /^sha256:[0-9a-f]{64}$/;

export async function readCmxPublicationState(
  response: Response,
): Promise<CmxPublicationState> {
  if (response.status !== 200) throw await readCmxPublicationError(response);
  const value: unknown = await response.json();
  if (
    !isRecord(value) ||
    !isHash(value.contentHash) ||
    !isRecord(value.manifest) ||
    !Object.values(value.manifest).every(isHash)
  ) {
    throw invalidResponse(response, "Invalid publication manifest.");
  }
  const state = value as CmxPublicationState;
  const etag = response.headers.get("ETag")?.replace(/^W\//, "");
  if (
    etag !== `"${state.contentHash}"` ||
    (await hashCmxPublicationManifest(state.manifest)) !== state.contentHash
  ) {
    throw invalidResponse(
      response,
      "Publication manifest does not match its content hash and ETag.",
    );
  }
  return state;
}

export async function readCmxPublicationResult(
  response: Response,
  targetContentHash: string,
): Promise<void> {
  if (response.status !== 200) throw await readCmxPublicationError(response);
  const value: unknown = await response.json();
  if (!isRecord(value) || value.contentHash !== targetContentHash) {
    throw invalidResponse(
      response,
      "Host did not acknowledge the target content hash.",
    );
  }
}

export async function readCmxPublicationError(
  response: Response,
): Promise<CmxPublicationError> {
  let value: unknown;
  try {
    value = await response.json();
  } catch (cause) {
    return new CmxPublicationError(
      `Document host responded with HTTP ${response.status}.`,
      { status: response.status, cause },
    );
  }
  if (
    !isRecord(value) ||
    typeof value.message !== "string" ||
    (value.diagnostics !== undefined && !isDiagnostics(value.diagnostics))
  ) {
    return invalidResponse(response, "Invalid publication error response.");
  }
  return new CmxPublicationError(value.message, {
    status: response.status,
    diagnostics: value.diagnostics as CmxPublicationDiagnostics | undefined,
  });
}

function invalidResponse(
  response: Response,
  message: string,
): CmxPublicationError {
  return new CmxPublicationError(message, { status: response.status });
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && hashPattern.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDiagnostics(value: unknown): value is CmxPublicationDiagnostics {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (diagnostics) =>
        Array.isArray(diagnostics) && diagnostics.every(isDiagnostic),
    )
  );
}

function isDiagnostic(value: unknown): value is CmxDiagnostic {
  if (
    !isRecord(value) ||
    value.severity !== "error" ||
    typeof value.code !== "string" ||
    typeof value.message !== "string"
  )
    return false;
  if (value.source === undefined) return true;
  const source = value.source;
  return (
    isRecord(source) &&
    typeof source.file === "string" &&
    typeof source.line === "number" &&
    Number.isFinite(source.line) &&
    typeof source.column === "number" &&
    Number.isFinite(source.column)
  );
}
