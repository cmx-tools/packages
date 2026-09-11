import { describe, expect, expectTypeOf, it } from "vitest";
import type { CmxDocument, CmxNode } from "@cmx-tools/contracts";
import { verifyCmxDocument } from "@cmx-tools/verify";

const documentFixture: CmxDocument = {
  $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
  cmxVersion: 1,
  interface: { imports: {}, exports: { default: { slots: [[]] } } },
  content: { default: { type: "element", tag: "main" } },
};

describe("verifyCmxDocument", () => {
  it("recovers a typed document from stored JSON", () => {
    const input: unknown = JSON.parse(JSON.stringify(documentFixture));
    const verification = verifyCmxDocument(input);
    expect(verification.valid).toBe(true);
    if (!verification.valid) throw new Error("Stored document was rejected");
    expectTypeOf(verification.document).toEqualTypeOf<CmxDocument>();
    expect(verification.document).toBe(input);
  });

  it("reports broken stored children", () => {
    const input: unknown = {
      ...documentFixture,
      content: { default: { type: "element", tag: "p", children: "broken" } },
    };
    const verification = verifyCmxDocument(input);
    expect(verification).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "invalid-node",
          message: expect.stringContaining("/content/default/children"),
        },
      ],
    });
  });

  it("verifies nested component slots relative to props without an environment", () => {
    const input = {
      ...documentFixture,
      interface: {
        imports: {
          "@site/ui": { name: "@site/ui", specifier: "^1", version: "1.0.0" },
        },
        exports: { default: { slots: [["body"]] } },
      },
      content: {
        default: {
          body: {
            type: "component",
            from: "@site/ui/card",
            props: { panels: [{ body: { type: "element", tag: 12 } }] },
            slots: [["panels", 0, "body"]],
          },
        },
      },
    };
    expect(verifyCmxDocument(input)).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "invalid-node",
          message: expect.stringContaining(
            "/content/default/body/props/panels/0/body/tag",
          ),
        },
      ],
    });
  });

  it("leaves ordinary data and markup policy to their consumers", () => {
    const data: Record<string, unknown> = {
      date: new Date("2026-01-01"),
      callback: () => 1,
      constructor: "editor",
      prototype: "draft",
      type: "unknown",
      number: Infinity,
    };
    data.self = data;
    const input = {
      ...documentFixture,
      metadata: data,
      interface: {
        imports: {
          "@site/ui": {
            name: "@site/ui",
            specifier: "^1",
            version: "1.0.0",
            metadata: data,
          },
        },
        exports: { default: { slots: [[]], metadata: data }, meta: {} },
        metadata: data,
      },
      content: {
        default: {
          type: "component",
          from: "@site/ui",
          metadata: data,
          props: { data, style: { color: "red" }, onClick: "action" },
          children: [
            {
              type: "element",
              tag: "script",
              props: { dangerouslySetInnerHTML: { __html: "run()" } },
            },
          ],
        },
        meta: data,
        analytics: { type: "unknown" },
      },
    };
    Object.defineProperty(input, "unrelated", {
      get() {
        throw new Error("Must remain opaque");
      },
    });
    expect(verifyCmxDocument(input)).toEqual({ valid: true, document: input });
    expect(input.content.meta).toBe(data);
    expect(data.self).toBe(data);
  });

  it("rejects component references to packages missing from the document's own imports", () => {
    expect(
      verifyCmxDocument({
        ...documentFixture,
        content: { default: { type: "component", from: "@site/ui" } },
      }),
    ).toMatchObject({
      valid: false,
      diagnostics: [{ code: "undeclared-component" }],
    });
  });

  it("rejects a declared prop slot removed by a content edit", () => {
    const input = {
      ...documentFixture,
      content: {
        default: {
          type: "element",
          tag: "p",
          props: {},
          slots: [["body"]],
        },
      },
    };
    expect(verifyCmxDocument(input)).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "invalid-node",
          message: expect.stringContaining("/content/default/props/body"),
        },
      ],
    });
  });

  it("requires export slots to resolve to owned values", () => {
    const input = {
      ...documentFixture,
      interface: {
        imports: {},
        exports: { default: { slots: [["constructor"]] } },
      },
    };
    expect(verifyCmxDocument(input)).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "invalid-document",
          message: expect.stringContaining("/content/default/constructor"),
        },
      ],
    });
  });

  it("accepts an owned slot value whose key also exists on Object.prototype", () => {
    const input = {
      ...documentFixture,
      interface: {
        imports: {},
        exports: { default: { slots: [["constructor"]] } },
      },
      content: { default: { constructor: { type: "element", tag: "p" } } },
    };
    expect(verifyCmxDocument(input)).toEqual({ valid: true, document: input });
  });

  it("rejects cyclic CMX children", () => {
    const node: CmxNode = { type: "element", tag: "p", children: [] };
    node.children!.push(node);
    const input = { ...documentFixture, content: { default: node } };
    expect(verifyCmxDocument(input)).toMatchObject({
      valid: false,
      diagnostics: [
        { code: "invalid-node", message: expect.stringContaining("cycles") },
      ],
    });
  });

  it("rejects cycles through declared prop slots", () => {
    const node: CmxNode = {
      type: "element",
      tag: "p",
      props: {},
      slots: [["body"]],
    };
    node.props!.body = node;
    expect(
      verifyCmxDocument({ ...documentFixture, content: { default: node } }),
    ).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "invalid-node",
          message: expect.stringContaining("/content/default/props/body"),
        },
      ],
    });
  });

  it("accepts a shared node reused in independent branches", () => {
    const node = { type: "element", tag: "p" };
    const input = {
      ...documentFixture,
      content: { default: { type: "fragment", children: [node, node] } },
    };
    expect(verifyCmxDocument(input)).toEqual({ valid: true, document: input });
  });

  it.each([
    ["an unsupported persisted version", { ...documentFixture, cmxVersion: 2 }],
    [
      "a broken import declaration",
      {
        ...documentFixture,
        interface: {
          ...documentFixture.interface,
          imports: { ui: { name: "ui" } },
        },
      },
    ],
    ["a stale export declaration", { ...documentFixture, content: {} }],
    ["a non-document response", null],
    [
      "a malformed export slot path",
      {
        ...documentFixture,
        interface: { imports: {}, exports: { default: { slots: [[{}]] } } },
      },
    ],
  ])("rejects %s", (_description, input) => {
    expect(verifyCmxDocument(input)).toMatchObject({
      valid: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "invalid-document" }),
      ]),
    });
  });

  it("rejects missing children in a sparse CMX child array", () => {
    const input = {
      ...documentFixture,
      content: { default: { type: "fragment", children: Array(1) } },
    };
    expect(verifyCmxDocument(input)).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "invalid-node",
          message: expect.stringContaining("/content/default/children/0"),
        },
      ],
    });
  });
});
