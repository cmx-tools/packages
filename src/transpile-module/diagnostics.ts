export enum ErrorCode {
  /**
   * Generic fallback for errors that do not expose a stable CMX code.
   */
  UNEXPECTED = "unexpected",
  /**
   * Build pipeline succeeded but produced no output file.
   */
  BUILD_NO_OUTPUT = "build-no-output",
  /**
   * Module does not expose a `default` export.
   */
  MISSING_DEFAULT_EXPORT = "missing-default-export",
  /**
   * Top-level default export resolved to a promise.
   */
  ASYNC_DEFAULT_EXPORT = "async-default-export",
  /**
   * Runtime value resolved to a promise where sync value is required.
   */
  ASYNC_VALUE = "async-value",
  /**
   * Runtime value resolved to `undefined`, which CMX output forbids.
   */
  UNDEFINED_VALUE = "undefined-value",
  /**
   * Runtime value is not recognized as valid CMX node output.
   */
  INVALID_RUNTIME_OUTPUT = "invalid-runtime-output",
  /**
   * Value cannot be normalized to supported CMX serializable data.
   */
  UNSUPPORTED_VALUE = "unsupported-value",
  /**
   * External import was used as plain runtime data instead of component ref.
   */
  EXTERNAL_RUNTIME_VALUE = "external-runtime-value",
  /**
   * External component reference was called as function instead of JSX.
   */
  EXTERNAL_COMPONENT_CALLED = "external-component-called",
  /**
   * Namespace import (`import * as X`) used for configured external module.
   */
  NAMESPACE_IMPORT_UNSUPPORTED = "namespace-import-unsupported",
  /**
   * Side-effect-only external import (`import "pkg"` without bindings);
   * external modules are not executed, so the import cannot be represented.
   */
  SIDE_EFFECT_EXTERNAL_IMPORT_UNSUPPORTED = "side-effect-external-import-unsupported",
  /**
   * JSX runtime received element type other than string/function/fragment.
   */
  UNSUPPORTED_JSX_ELEMENT_TYPE = "unsupported-jsx-element-type",
}

const ERROR_CODE_VALUES = new Set<string>(Object.values(ErrorCode));

export type Diagnostic = { code: ErrorCode; message: string };

export class TranspileError extends Error {
  code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "TranspileError";
    this.code = code;
  }
}

export function isKnownErrorCode(value: string): value is ErrorCode {
  return ERROR_CODE_VALUES.has(value);
}

export function diagnosticsFromError(error: unknown): Diagnostic[] {
  if (error instanceof TranspileError) {
    return [{ code: error.code, message: error.message }];
  }

  const message = error instanceof Error ? error.message : String(error);
  const taggedCodeMatch = /\[cmx:([a-z0-9-]+)\]\s*([^\n]+)/u.exec(message);
  if (taggedCodeMatch) {
    const [, code, stableMessage] = taggedCodeMatch;
    if (isKnownErrorCode(code)) {
      return [{ code, message: stableMessage }];
    }

    return [{ code: ErrorCode.UNEXPECTED, message: stableMessage }];
  }

  return [{ code: ErrorCode.UNEXPECTED, message }];
}
