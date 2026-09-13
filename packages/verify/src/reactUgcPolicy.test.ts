import type { CmxDocument, CmxNode } from "@cmx-tools/contracts";
import { describe, expect, it } from "vitest";
import { createCmxUgcVerifier } from "@cmx-tools/verify";
import { reactUgcPolicy } from "@cmx-tools/verify/react";

const SCHEMA = "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json";

describe("reactUgcPolicy", () => {
  it("adds React-dialect restrictions only when a publishing application selects them", async () => {
    const document: CmxDocument = {
      $schema: SCHEMA,
      cmxVersion: 1,
      interface: { imports: {}, exports: { default: { slots: [[]] } } },
      content: {
        default: {
          type: "element",
          tag: "p",
          props: {
            className: "promoted",
            dangerouslySetInnerHTML: { __html: "<strong>Hello</strong>" },
            suppressContentEditableWarning: true,
            suppressHydrationWarning: true,
          },
        },
      },
    };

    expect(await createCmxUgcVerifier()(document)).toEqual({ valid: true });
    expect(
      await createCmxUgcVerifier({ policy: reactUgcPolicy })(document),
    ).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/className"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/dangerouslySetInnerHTML"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining(
            "/props/suppressContentEditableWarning",
          ),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/suppressHydrationWarning"),
        },
      ],
    });
  });
  it("retains CMX element, prop, and URL restrictions when React checks are added", async () => {
    const document: CmxDocument = {
      $schema: SCHEMA,
      cmxVersion: 1,
      interface: { imports: {}, exports: { default: { slots: [[]] } } },
      content: {
        default: {
          type: "element",
          tag: "script",
          props: {
            class: "promoted",
            innerHTML: "run()",
            style: "color: red",
            onClick: "run()",
            src: "javascript:run()",
            className: "promoted",
          },
        },
      },
    };

    expect(
      await createCmxUgcVerifier({ policy: reactUgcPolicy })(document),
    ).toMatchObject({
      valid: false,
      diagnostics: [
        { code: "ugc-disallowed-element" },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/class"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/innerHTML"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/style"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/onClick"),
        },
        {
          code: "ugc-unsafe-url",
          message: expect.stringContaining("/props/src"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/className"),
        },
      ],
    });
  });

  it("leaves component-owned React props alone while checking authored intrinsic slots", async () => {
    const body: CmxNode = {
      type: "element",
      tag: "p",
      props: { className: "promoted" },
    };
    const document: CmxDocument = {
      $schema: SCHEMA,
      cmxVersion: 1,
      interface: {
        imports: {
          "@site/ui": {
            name: "@site/ui",
            specifier: "^1.0.0",
            version: "1.2.0",
          },
        },
        exports: { default: { slots: [[]] } },
      },
      content: {
        default: {
          type: "component",
          from: "@site/ui",
          import: "Frame",
          props: {
            className: "application-layout",
            dangerouslySetInnerHTML: {
              __html: "<p>Application-owned markup</p>",
            },
            body,
          },
          slots: [["body"]],
        },
      },
    };
    const verifyCmxUgc = createCmxUgcVerifier({ policy: reactUgcPolicy });

    expect(await verifyCmxUgc(document)).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/className"),
        },
      ],
    });
    body.props = {};
    expect(await verifyCmxUgc(document)).toEqual({ valid: true });
  });
});
