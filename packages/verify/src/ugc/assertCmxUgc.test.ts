import { describe, expect, expectTypeOf, it } from "vitest";
import { CmxError, type CmxDocument } from "@cmx-tools/contracts";
import {
  assertCmxDocument,
  CmxDocumentVerificationError,
} from "@cmx-tools/verify";
import { assertCmxUgc, CmxUgcError } from "@cmx-tools/verify";
import { reactUgcPolicy } from "@cmx-tools/verify/react";

describe("assertCmxUgc", () => {
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
    await assertCmxUgc(input);

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
          props: { innerHTML: "run()" },
        },
      },
    };
    let caught: unknown;

    try {
      assertCmxDocument(input);
      await assertCmxUgc(input);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CmxUgcError);
    expect(caught).toBeInstanceOf(CmxError);
    expect(caught).not.toBeInstanceOf(CmxDocumentVerificationError);
    if (!(caught instanceof CmxUgcError)) {
      throw new Error("Expected a CMX UGC error");
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.name).toBe("CmxUgcError");
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
      assertCmxUgc(document, { allowedElements: ["em"] }),
    ).resolves.toBeUndefined();
    await expect(
      assertCmxUgc(document, { allowedElements: [] }),
    ).rejects.toBeInstanceOf(CmxUgcError);
  });
  it("lets a React application explicitly assert its dialect in addition to CMX content rules", async () => {
    const document: CmxDocument = {
      $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
      cmxVersion: 1,
      interface: { imports: {}, exports: { default: { slots: [[]] } } },
      content: {
        default: {
          type: "element",
          tag: "strong",
          props: { className: "promoted" },
        },
      },
    };

    await expect(assertCmxUgc(document)).resolves.toBeUndefined();
    await expect(
      assertCmxUgc(document, {
        allowedElements: ["strong"],
        policy: reactUgcPolicy,
      }),
    ).rejects.toMatchObject({
      name: "CmxUgcError",
      diagnostics: [
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/className"),
        },
      ],
    });
  });
});
