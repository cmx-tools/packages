import { describe, expect, it } from "vitest";
import type { CmxDocument, CmxNode } from "@cmx-tools/contracts";
import { verifyCmxDocument } from "@cmx-tools/verify";
import {
  createReactUgcVerifier,
  contentElements,
  tableElements,
  mediaElements,
} from "@cmx-tools/verify/react";

const SCHEMA = "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json";

describe("createReactUgcVerifier", () => {
  it("checks an article loaded from JSON for document validity before applying content policy", async () => {
    const document = createDocument({
      imports: {
        "@site/ui": {
          name: "@site/ui",
          specifier: "^1.0.0",
          version: "1.2.0",
        },
      },
      node: {
        type: "fragment",
        children: [
          {
            type: "element",
            tag: "article",
            children: [
              "Hello",
              {
                type: "element",
                tag: "a",
                props: { href: "/about" },
                children: ["About"],
              },
            ],
          },
          {
            type: "component",
            from: "@site/ui/card",
            import: "Card",
            props: { tone: "quiet" },
          },
        ],
      },
    });

    const loaded: unknown = JSON.parse(JSON.stringify(document));
    const structure = verifyCmxDocument(loaded);
    if (!structure.valid) {
      throw new Error("Stored document has invalid CMX structure");
    }

    const verifyReactUgc = createReactUgcVerifier();
    const content = await verifyReactUgc(structure.document);

    expect(content).toEqual({ valid: true });
  });

  it("lets a publishing application opt into tables alongside default content", async () => {
    const document = createDocument({
      node: {
        type: "element",
        tag: "article",
        children: [
          {
            type: "element",
            tag: "table",
            children: [
              {
                type: "element",
                tag: "tbody",
                children: [
                  {
                    type: "element",
                    tag: "tr",
                    children: [
                      { type: "element", tag: "td", children: ["Price"] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect((await createReactUgcVerifier()(document)).valid).toBe(false);
    const verifyReactUgc = createReactUgcVerifier({
      allowedElements: [...contentElements, ...tableElements],
    });
    expect(await verifyReactUgc(document)).toEqual({ valid: true });
  });

  it("lets a comment field replace the defaults with only inline emphasis", async () => {
    const verifyReactUgc = createReactUgcVerifier({
      allowedElements: ["em", "strong"],
    });
    const comment = createDocument({
      node: {
        type: "fragment",
        children: [
          "Please ",
          { type: "element", tag: "em", children: ["read"] },
        ],
      },
    });
    const link = createDocument({
      node: { type: "element", tag: "a", props: { href: "/promote" } },
    });

    expect(await verifyReactUgc(comment)).toEqual({ valid: true });
    expect(await verifyReactUgc(link)).toMatchObject({
      valid: false,
      diagnostics: [{ code: "ugc-disallowed-element" }],
    });
  });

  it("allows text and trusted components when an application disables all intrinsic elements", async () => {
    const verifyReactUgc = createReactUgcVerifier({ allowedElements: [] });
    const document = createDocument({
      node: {
        type: "component",
        from: "@site/ui",
        import: "Notice",
        children: ["Plain text"],
      },
      imports: {
        "@site/ui": {
          name: "@site/ui",
          specifier: "^1.0.0",
          version: "1.2.0",
        },
      },
    });

    expect(await verifyReactUgc(document)).toEqual({ valid: true });
    expect(
      await verifyReactUgc(
        createDocument({ node: { type: "element", tag: "p" } }),
      ),
    ).toMatchObject({
      valid: false,
      diagnostics: [{ code: "ugc-disallowed-element" }],
    });
  });

  it("leaves ordinary component props to their owner while checking embedded markup", async () => {
    const data: Record<string, unknown> = {
      style: "editorial",
      nodeLikeData: { type: "element", tag: "script" },
    };
    data.self = data;
    const body: CmxNode = {
      type: "element",
      tag: "p",
      children: ["Author content"],
    };
    const document = createDocument({
      imports: {
        "@site/ui": {
          name: "@site/ui",
          specifier: "^1.0.0",
          version: "1.2.0",
        },
      },
      node: {
        type: "component",
        from: "@site/ui",
        import: "Frame",
        props: {
          style: "editorial",
          onSelect: "expand",
          data,
          body,
        },
        slots: [["body"]],
        children: [{ type: "element", tag: "strong", children: ["Heading"] }],
      },
    });
    const verifyReactUgc = createReactUgcVerifier();

    expect(await verifyReactUgc(document)).toEqual({ valid: true });

    body.props = { style: { color: "red" } };
    expect(await verifyReactUgc(document)).toMatchObject({
      valid: false,
      diagnostics: [{ code: "ugc-disallowed-prop" }],
    });
  });

  it("rejects author-controlled styling in a structurally valid document", async () => {
    const document = createDocument({
      node: {
        type: "fragment",
        children: [
          { type: "element", tag: "style", children: ["body{}"] },
          {
            type: "element",
            tag: "p",
            props: {
              style: { color: "red" },
              className: "promoted",
              id: "app",
            },
          },
        ],
      },
    });

    expect(verifyCmxDocument(document).valid).toBe(true);
    expect(await invalidCodes(document)).toEqual([
      "ugc-disallowed-element",
      "ugc-disallowed-prop",
      "ugc-disallowed-prop",
      "ugc-disallowed-prop",
    ]);
  });

  it("rejects active markup, event props, raw HTML, and executable URLs", async () => {
    const document = createDocument({
      node: {
        type: "fragment",
        children: [
          { type: "element", tag: "script", children: ["bad()"] },
          {
            type: "element",
            tag: "a",
            props: {
              href: "javascript:bad()",
              onClick: "bad()",
              dangerouslySetInnerHTML: { __html: "<img onerror=bad()>" },
            },
          },
          {
            type: "element",
            tag: "iframe",
            props: { srcDoc: "<script>bad()</script>" },
          },
          { type: "element", tag: "x-user-widget" },
        ],
      },
    });

    expect(await invalidCodes(document)).toEqual([
      "ugc-disallowed-element",
      "ugc-unsafe-url",
      "ugc-disallowed-prop",
      "ugc-disallowed-prop",
      "ugc-disallowed-element",
      "ugc-disallowed-prop",
      "ugc-disallowed-element",
    ]);
  });

  it("inspects CMX nodes in renderer-shaped prop slots", async () => {
    const document = createDocument({
      imports: {
        "@site/ui": {
          name: "@site/ui",
          specifier: "^1.0.0",
          version: "1.2.0",
        },
      },
      node: {
        type: "component",
        from: "@site/ui",
        import: "Frame",
        props: {
          body: {
            type: "element",
            tag: "script",
          },
        },
        slots: [["body"]],
      },
    });

    expect(await invalidCodes(document)).toContain("ugc-disallowed-element");
  });

  it("leaves ref callbacks attached outside the JSON Document boundary alone", async () => {
    let refCalled = false;
    const document = createDocument({
      node: {
        type: "element",
        tag: "p",
        props: {
          ref: () => {
            refCalled = true;
          },
        },
        children: ["Hello"],
      },
    });

    expect(await createReactUgcVerifier()(document)).toEqual({ valid: true });
    expect(refCalled).toBe(false);
  });

  it("checks intrinsic markup in a declared props.children slot", async () => {
    const child: CmxNode = {
      type: "element",
      tag: "strong",
      children: ["Hello"],
    };
    const document = createDocument({
      node: {
        type: "element",
        tag: "div",
        props: { children: child },
        slots: [["children"]],
      },
    });

    expect(verifyCmxDocument(document).valid).toBe(true);
    expect(await createReactUgcVerifier()(document)).toEqual({ valid: true });

    child.props = { style: { color: "red" } };
    expect(await invalidCodes(document)).toEqual(["ugc-disallowed-prop"]);
  });

  it("uses the application's explicit tag list even for active and custom elements", async () => {
    const document = createDocument({
      node: {
        type: "fragment",
        children: [
          { type: "element", tag: "script", children: ["run()"] },
          { type: "element", tag: "site-map" },
        ],
      },
    });
    const verifyReactUgc = createReactUgcVerifier({
      allowedElements: ["script", "site-map"],
    });

    expect(await invalidCodes(document)).toEqual([
      "ugc-disallowed-element",
      "ugc-disallowed-element",
    ]);
    expect(await verifyReactUgc(document)).toEqual({ valid: true });
  });

  it("lets a publisher explicitly permit media while retaining resource URL checks", async () => {
    const video: CmxNode = {
      type: "element",
      tag: "video",
      props: { controls: true, poster: "/poster.jpg" },
      children: [
        { type: "element", tag: "source", props: { src: "/movie.mp4" } },
      ],
    };
    const document = createDocument({
      node: {
        type: "element",
        tag: "article",
        children: [
          {
            type: "element",
            tag: "img",
            props: { src: "https://example.org/photo.jpg", alt: "A tree" },
          },
          video,
        ],
      },
    });
    const verifyReactUgc = createReactUgcVerifier({
      allowedElements: [...contentElements, ...mediaElements],
    });

    expect((await createReactUgcVerifier()(document)).valid).toBe(false);
    expect(await verifyReactUgc(document)).toEqual({ valid: true });

    video.props = { poster: "data:image/svg+xml,<svg></svg>" };
    expect(await verifyReactUgc(document)).toMatchObject({
      valid: false,
      diagnostics: [{ code: "ugc-unsafe-url" }],
    });
  });

  it("accepts local navigation, web links, and contact links without rewriting them", async () => {
    const urls = [
      "/about",
      "../guide",
      "#references",
      "?page=2",
      "/javascript:guide",
      "//example.org/about",
      "http://example.org/about",
      "https://example.org/about",
      "mailto:editor@example.org",
      "tel:+123456789",
    ];
    const document = createDocument({
      node: {
        type: "fragment",
        children: urls.map((href) => ({
          type: "element",
          tag: "a",
          props: { href },
          children: [href],
        })),
      },
    });
    const before = structuredClone(document);

    expect(await createReactUgcVerifier()(document)).toEqual({ valid: true });
    expect(document).toEqual(before);
  });

  it.each([
    "javascript:run()",
    " \u0000JaVaScRiPt:run()",
    "java\tscript:run()",
    "java\nscript:run()",
    "data:text/html,<script>run()</script>",
    "vbscript:run()",
    "file:///etc/passwd",
    "blob:https://example.org/123",
    "https://[broken",
  ])(
    "rejects an executable, unsupported, or malformed link URL %j",
    async (href) => {
      const document = createDocument({
        node: { type: "element", tag: "a", props: { href } },
      });

      expect(await invalidCodes(document)).toEqual(["ugc-unsafe-url"]);
    },
  );

  it("rejects URL values that would require coercing application data", async () => {
    let coerced = false;
    const document = createDocument({
      node: {
        type: "element",
        tag: "a",
        props: {
          href: {
            toString() {
              coerced = true;
              return "https://example.org";
            },
          },
        },
      },
    });

    expect(await invalidCodes(document)).toEqual(["ugc-unsafe-url"]);
    expect(coerced).toBe(false);
  });

  it("treats un-slotted structured exports as data and leaves the Document unchanged", async () => {
    const document: CmxDocument = {
      $schema: SCHEMA,
      cmxVersion: 1,
      interface: {
        imports: {},
        exports: {
          meta: {},
        },
      },
      content: {
        meta: {
          style: "editorial",
          nodeLikeData: { type: "element", tag: "script" },
        },
      },
    };
    const before = JSON.stringify(document);

    expect(await createReactUgcVerifier()(document)).toEqual({ valid: true });
    expect(JSON.stringify(document)).toBe(before);
  });
});

function createDocument(input: {
  node: CmxNode;
  imports?: CmxDocument["interface"]["imports"];
}): CmxDocument {
  return {
    $schema: SCHEMA,
    cmxVersion: 1,
    interface: {
      imports: input.imports ?? {},
      exports: {
        default: {
          slots: [[]],
        },
      },
    },
    content: {
      default: input.node,
    },
  };
}

async function invalidCodes(document: CmxDocument): Promise<string[]> {
  const result = await createReactUgcVerifier()(document);
  expect(result.valid).toBe(false);
  return result.valid
    ? []
    : result.diagnostics.map((diagnostic) => diagnostic.code);
}
