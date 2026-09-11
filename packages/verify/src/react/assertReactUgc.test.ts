import { describe, expect, expectTypeOf, it } from "vitest";
import { CmxError, type CmxDocument } from "@cmx-tools/contracts";
import {
  assertCmxDocument,
  CmxDocumentVerificationError,
} from "@cmx-tools/verify";
import { assertReactUgc, ReactUgcError } from "@cmx-tools/verify/react";

describe("assertReactUgc", () => {
  it("accepts stored article content through separate structural and policy assertions", async () => {
    const input: unknown = JSON.parse(`{
      "$schema": "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
      "cmxVersion": 1,
      "interface": {
        "imports": {},
        "exports": { "default": { "slots": [[]] } }
      },
      "content": {
        "default": {
          "type": "element",
          "tag": "article",
          "children": ["Hello"]
        }
      }
    }`);
    const original = input;

    assertCmxDocument(input);
    await assertReactUgc(input);

    expectTypeOf(input).toEqualTypeOf<CmxDocument>();
    expect(input).toBe(original);
  });

  it("lets a publisher distinguish content policy violations from malformed documents", async () => {
    const input: unknown = {
      $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
      cmxVersion: 1,
      interface: { imports: {}, exports: { default: { slots: [[]] } } },
      content: {
        default: {
          type: "element",
          tag: "script",
          props: { dangerouslySetInnerHTML: { __html: "run()" } },
        },
      },
    };
    let caught: unknown;

    try {
      assertCmxDocument(input);
      await assertReactUgc(input);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ReactUgcError);
    expect(caught).toBeInstanceOf(CmxError);
    expect(caught).not.toBeInstanceOf(CmxDocumentVerificationError);
    if (!(caught instanceof ReactUgcError)) {
      throw new Error("Expected a React UGC error");
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.name).toBe("ReactUgcError");
    expect(caught.diagnostics).toMatchObject([
      { severity: "error", code: "ugc-disallowed-element" },
      { severity: "error", code: "ugc-disallowed-prop" },
    ]);
  });

  it("uses the application's element selection when asserting comment content", async () => {
    const document: CmxDocument = {
      $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
      cmxVersion: 1,
      interface: { imports: {}, exports: { default: { slots: [[]] } } },
      content: { default: { type: "element", tag: "em", children: ["Hello"] } },
    };

    await expect(
      assertReactUgc(document, { allowedElements: ["em"] }),
    ).resolves.toBeUndefined();
    await expect(
      assertReactUgc(document, { allowedElements: [] }),
    ).rejects.toBeInstanceOf(ReactUgcError);
  });
});
