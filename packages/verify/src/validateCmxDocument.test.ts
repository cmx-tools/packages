import { describe, expect, it, vi } from "vitest";
import type { CmxDocument } from "@cmx-tools/contracts";
import { validateCmxDocument, verifyCmxDocument } from "@cmx-tools/verify";

const documentFixture: CmxDocument = {
  $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
  cmxVersion: 1,
  interface: { imports: {}, exports: { default: { slots: [[]] } } },
  content: { default: { type: "element", tag: "main" } },
};

describe("validateCmxDocument", () => {
  it("respects the caller's decision to trust a document", async () => {
    const document = {
      ...documentFixture,
      content: { default: { type: "element", tag: "p", children: "broken" } },
    } as CmxDocument;
    const verifyDocument = vi.fn(() => ({ valid: true as const }));

    expect(await validateCmxDocument({ document })).toEqual({
      result: "valid",
      document,
    });
    expect(await validateCmxDocument({ document, verifyDocument })).toEqual({
      result: "valid",
      document,
    });
    expect(verifyDocument).toHaveBeenCalledWith(document);
  });

  it("lets a caller explicitly reverify a document through the verification hook", async () => {
    const document = {
      ...documentFixture,
      content: { default: { type: "element", tag: "p", children: "broken" } },
    } as CmxDocument;

    expect(
      await validateCmxDocument({
        document,
        verifyDocument: verifyCmxDocument,
      }),
    ).toMatchObject({
      result: "invalid",
      diagnostics: [{ code: "invalid-node" }],
    });
  });

  it("accepts a valid document without a policy", async () => {
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
