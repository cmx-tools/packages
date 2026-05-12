import { describe, expect, it } from "vitest";
import type { CmxDocument } from "@cmx-tools/contracts";
import { validateCmxDocument } from "./validateCmxDocument.js";

const documentFixture: CmxDocument = {
  $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
  cmxVersion: 1,
  interface: { imports: {}, exports: {} },
  content: { default: { type: "element", tag: "main" } },
};

describe("validateCmxDocument", () => {
  it("passes through when verifier is absent", async () => {
    const result = await validateCmxDocument({ document: documentFixture });
    expect(result).toEqual({ result: "valid", document: documentFixture });
  });

  it("passes through when verifier reports valid", async () => {
    const result = await validateCmxDocument({
      document: documentFixture,
      verifyDocument: async () => ({ valid: true }),
    });
    expect(result).toEqual({ result: "valid", document: documentFixture });
  });

  it("returns diagnostics when verifier reports invalid", async () => {
    const result = await validateCmxDocument({
      document: documentFixture,
      verifyDocument: () => ({
        valid: false,
        diagnostics: [
          {
            severity: "error",
            code: "blocked-tag",
            message: "script blocked",
          },
        ],
      }),
    });
    expect(result).toEqual({
      result: "invalid",
      diagnostics: [
        {
          severity: "error",
          code: "blocked-tag",
          message: "script blocked",
        },
      ],
    });
  });

  it("maps thrown verifier error to document-verifier-error diagnostic", async () => {
    const result = await validateCmxDocument({
      document: documentFixture,
      verifyDocument: () => {
        throw new Error("boom");
      },
    });
    expect(result).toEqual({
      result: "invalid",
      diagnostics: [
        {
          severity: "error",
          code: "document-verifier-error",
          message: "Document verifier threw: boom",
        },
      ],
    });
  });
});
