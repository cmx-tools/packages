import { describe, expect, expectTypeOf, it } from "vitest";
import { CmxError, type CmxDocument } from "@cmx-tools/contracts";
import {
  assertCmxDocument,
  CmxDocumentVerificationError,
  isCmxDocument,
} from "@cmx-tools/verify";

describe("assertCmxDocument", () => {
  it("narrows loaded JSON in place so a caller can use it without a cast", () => {
    const input: unknown = JSON.parse(`{
      "$schema": "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
      "cmxVersion": 1,
      "interface": { "imports": {}, "exports": { "title": {} } },
      "content": { "title": "Hello" }
    }`);
    const original = input;

    assertCmxDocument(input);

    expectTypeOf(input).toEqualTypeOf<CmxDocument>();
    expect(input).toBe(original);
    expect(input.content.title).toBe("Hello");
    expect(isCmxDocument(input)).toBe(true);
  });

  it("lets a storage boundary catch document failures and report every stale export", () => {
    const input: unknown = {
      $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
      cmxVersion: 1,
      interface: { imports: {}, exports: { title: {}, body: {} } },
      content: {},
    };
    let caught: unknown;

    try {
      assertCmxDocument(input);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CmxDocumentVerificationError);
    expect(caught).toBeInstanceOf(CmxError);
    if (!(caught instanceof CmxDocumentVerificationError)) {
      throw new Error("Expected a document verification error");
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.name).toBe("CmxDocumentVerificationError");
    expect(caught.diagnostics).toMatchObject([
      {
        severity: "error",
        code: "invalid-document",
        message: expect.stringContaining("/content/title"),
      },
      {
        severity: "error",
        code: "invalid-document",
        message: expect.stringContaining("/content/body"),
      },
    ]);
    expect(isCmxDocument(input)).toBe(false);
  });
});
