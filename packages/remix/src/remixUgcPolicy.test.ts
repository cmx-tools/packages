import type { CmxDocument, CmxNode } from "@cmx-tools/contracts";
import { describe, expect, it } from "vitest";
import {
  assertCmxUgc,
  contentElements,
  createCmxUgcVerifier,
  tableElements,
} from "@cmx-tools/verify";
import { remixUgcPolicy } from "@cmx-tools/remix";

const SCHEMA = "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json";

describe("remixUgcPolicy", () => {
  it("accepts an article while an opted-in publisher rejects author-supplied mixins", async () => {
    const document = createDocument({
      type: "element",
      tag: "article",
      children: [
        {
          type: "element",
          tag: "a",
          props: { href: "/about", "data-category": "news" },
          children: ["About"],
        },
      ],
    });

    await expect(
      assertCmxUgc(document, { policy: remixUgcPolicy }),
    ).resolves.toBeUndefined();
    const mixed = createDocument({
      type: "element",
      tag: "article",
      props: { mix: [] },
      children: ["Author content"],
    });

    expect(await createCmxUgcVerifier()(mixed)).toEqual({ valid: true });
    await expect(
      assertCmxUgc(mixed, { policy: remixUgcPolicy }),
    ).rejects.toMatchObject({
      name: "CmxUgcError",
      diagnostics: [
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/mix"),
        },
      ],
    });
  });

  it("rejects authored navigation and DOM reconciliation controls", async () => {
    const document = createDocument({
      type: "fragment",
      children: [
        {
          type: "element",
          tag: "a",
          props: {
            href: "/account",
            "data-rmx-document": true,
            "data-rmx-history": "replace",
            "data-rmx-reset-scroll": false,
            "data-rmx-src": "/private",
            "data-rmx-target": "#account-panel",
          },
          children: ["Account"],
        },
        {
          type: "element",
          tag: "section",
          props: {
            "data-rmx-key": "account-panel",
            "data-rmx-preserve-attrs": "class",
            "data-rmx-preserve-dom": true,
          },
          children: ["Author content"],
        },
      ],
    });

    expect(await createCmxUgcVerifier()(document)).toEqual({ valid: true });
    expect(
      await createCmxUgcVerifier({ policy: remixUgcPolicy })(document),
    ).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/data-rmx-document"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/data-rmx-history"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/data-rmx-reset-scroll"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/data-rmx-src"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/data-rmx-target"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/data-rmx-key"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/data-rmx-preserve-attrs"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/data-rmx-preserve-dom"),
        },
      ],
    });
  });

  it("rejects runtime-managed resource markers when a publisher enables resource elements", async () => {
    const document = createDocument({
      type: "fragment",
      children: [
        {
          type: "element",
          tag: "style",
          props: { "data-rmx-style": "article" },
          children: ["p { color: red; }"],
        },
        {
          type: "element",
          tag: "script",
          props: { type: "importmap", "data-rmx-import-map": true },
          children: ['{"imports":{}}'],
        },
        {
          type: "element",
          tag: "link",
          props: {
            rel: "modulepreload",
            href: "/article.js",
            "data-rmx-module-preload": true,
          },
        },
      ],
    });
    const allowedElements = ["style", "script", "link"];

    expect(await createCmxUgcVerifier({ allowedElements })(document)).toEqual({
      valid: true,
    });
    expect(
      await createCmxUgcVerifier({ allowedElements, policy: remixUgcPolicy })(
        document,
      ),
    ).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/data-rmx-style"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/data-rmx-import-map"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/data-rmx-module-preload"),
        },
      ],
    });
  });

  it("lets a publisher enable article tables while retaining shared markup restrictions", async () => {
    const cell: CmxNode = { type: "element", tag: "td", children: ["Price"] };
    const document = createDocument({
      type: "element",
      tag: "table",
      children: [{ type: "element", tag: "tr", children: [cell] }],
    });
    const verify = createCmxUgcVerifier({
      allowedElements: [...contentElements, ...tableElements],
      policy: remixUgcPolicy,
    });

    expect(
      (await createCmxUgcVerifier({ policy: remixUgcPolicy })(document)).valid,
    ).toBe(false);
    expect(await verify(document)).toEqual({ valid: true });
    cell.children = [
      {
        type: "element",
        tag: "script",
        props: {
          className: "site-layout",
          style: "color: red",
          src: "javascript:run()",
        },
      },
    ];

    expect(await verify(document)).toMatchObject({
      valid: false,
      diagnostics: [
        { code: "ugc-disallowed-element" },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/className"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/style"),
        },
        {
          code: "ugc-unsafe-url",
          message: expect.stringContaining("/props/src"),
        },
      ],
    });
  });

  it("leaves trusted component controls opaque while checking authored intrinsic slots", async () => {
    const body: CmxNode = {
      type: "element",
      tag: "a",
      props: { href: "/account", "data-rmx-target": "#account-panel" },
      children: ["Account"],
    };
    const document = createDocument({
      type: "component",
      from: "@site/ui",
      import: "Frame",
      props: {
        mix: [],
        className: "application-layout",
        "data-rmx-src": "/account",
        nodeLikeData: { type: "element", tag: "script", props: { mix: [] } },
        body,
      },
      slots: [["body"]],
    });
    document.interface.imports = {
      "@site/ui": { name: "@site/ui", specifier: "^1.0.0", version: "1.2.0" },
    };
    const verify = createCmxUgcVerifier({ policy: remixUgcPolicy });

    expect(await verify(document)).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/data-rmx-target"),
        },
      ],
    });
    delete body.props?.["data-rmx-target"];
    expect(await verify(document)).toEqual({ valid: true });
  });
});

function createDocument(node: CmxNode): CmxDocument {
  return {
    $schema: SCHEMA,
    cmxVersion: 1,
    interface: { imports: {}, exports: { default: { slots: [[]] } } },
    content: { default: node },
  };
}
