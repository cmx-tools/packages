import {
  clientEntry,
  createElement,
  type Handle,
  type RemixNode,
} from "remix/component";
import { renderToString } from "remix/component/server";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CmxError,
  type CmxDocument,
  type CmxEnvironment,
  type CmxNode,
} from "@cmx-tools/contracts";
import { CmxRemixError, cmx } from "@cmx-tools/remix";

const theme = {
  name: "@site/theme",
  specifier: "^1.0.0",
  version: "1.2.3",
};

describe("cmx", () => {
  it("renders canonical CMX raw HTML through the native Remix renderer", async () => {
    const document = createDocument({
      default: {
        type: "element",
        tag: "article",
        props: {
          class: "story",
          innerHTML: "<strong>Fresh &amp; local</strong>",
        },
      },
    });
    const before = structuredClone(document);

    const page = cmx(document);

    expect(await renderToString(page.default as RemixNode)).toBe(
      '<article class="story"><strong>Fresh &amp; local</strong></article>',
    );
    expect(document).toEqual(before);
  });

  it("does not interpret React raw HTML props as Remix markup", async () => {
    const page = cmx(
      createDocument({
        default: {
          type: "element",
          tag: "div",
          props: {
            dangerouslySetInnerHTML: { __html: "<strong>React only</strong>" },
          },
          children: ["Remix content"],
        },
      }),
    );

    const html = await renderToString(page.default as RemixNode);

    expect(html).toContain(">Remix content</div>");
    expect(html).not.toContain("<strong>React only</strong>");
  });

  it("renders a page with a native imported component and metadata slot", async () => {
    function Heading(handle: Handle<{ title: string }>) {
      return () => createElement("h1", {}, handle.props.title);
    }
    const document = createDocument(
      {
        default: {
          type: "element",
          tag: "main",
          children: [
            {
              type: "component",
              from: "@site/theme",
              import: "Heading",
              props: { title: "About CMX" },
            },
          ],
        },
        meta: {
          title: "About",
          badge: {
            type: "element",
            tag: "strong",
            props: { innerHTML: "<em>New</em>" },
          },
        },
      },
      { default: { slots: [[]] }, meta: { slots: [["badge"]] } },
      { [theme.name]: theme },
    );
    const environment: CmxEnvironment<{
      default: CmxNode;
      meta: { title: string; badge: CmxNode };
    }> = {
      dependencies: [theme],
      imports: { [theme.name]: { Heading } },
    };

    const page = cmx(document, environment);

    expect(await renderToString(page.default)).toBe(
      "<main><h1>About CMX</h1></main>",
    );
    expect(page.meta.title).toBe("About");
    expect(await renderToString(page.meta.badge)).toBe(
      "<strong><em>New</em></strong>",
    );
  });

  it("renders nested fragments and primitive children with native escaping", async () => {
    const page = cmx(
      createDocument({
        default: {
          type: "fragment",
          children: [
            "<intro>&",
            null,
            false,
            true,
            0,
            {
              type: "fragment",
              children: [
                {
                  type: "element",
                  tag: "p",
                  props: { title: '\"quote\" & <tag>' },
                  children: ["Body <text>"],
                },
              ],
            },
          ],
        },
      }),
    );

    expect(await renderToString(page.default as RemixNode)).toBe(
      '&lt;intro&gt;&amp;0<p title="&quot;quote&quot; &amp; &lt;tag&gt;">Body &lt;text&gt;</p>',
    );
  });

  it("hydrates nested prop slots for a default import while preserving ordinary data", async () => {
    function Panel(
      handle: Handle<{
        innerHTML: string;
        children: RemixNode;
        config: { icons: RemixNode[]; data: { type: string; tag: string } };
      }>,
    ) {
      return () =>
        createElement(
          "section",
          {
            "data-tag": handle.props.config.data.tag,
            "data-template": handle.props.innerHTML,
          },
          handle.props.children,
          ...handle.props.config.icons,
        );
    }
    const data = {
      type: "element",
      tag: "template",
      innerHTML: "application metadata",
      children: ["Keep as data"],
    };
    const document = createDocument(
      {
        default: {
          type: "component",
          from: theme.name,
          props: {
            innerHTML: "component <template>",
            children: {
              type: "element",
              tag: "h2",
              props: { innerHTML: "<em>Features</em>" },
            },
            config: {
              icons: [
                "Icon: ",
                {
                  type: "element",
                  tag: "b",
                  props: { innerHTML: "<i>New</i>" },
                },
              ],
              data,
            },
          },
          slots: [["children"], ["config", "icons", 1]],
        },
        catalog: data,
      },
      { default: { slots: [[]] }, catalog: {} },
      { [theme.name]: theme },
    );

    const page = cmx(document, {
      dependencies: [theme],
      imports: { [theme.name]: { default: Panel } },
    });

    expect(await renderToString(page.default as RemixNode)).toBe(
      '<section data-tag="template" data-template="component &lt;template&gt;"><h2><em>Features</em></h2>Icon: <b><i>New</i></b></section>',
    );
    expect(page.catalog).toBe(data);
    expect(document.content.catalog).toEqual({
      type: "element",
      tag: "template",
      innerHTML: "application metadata",
      children: ["Keep as data"],
    });
  });

  it("uses authored node children ahead of the component children prop", async () => {
    function Notice(handle: Handle<{ children: RemixNode }>) {
      return () => createElement("aside", {}, handle.props.children);
    }
    const page = cmx(
      createDocument(
        {
          default: {
            type: "component",
            from: theme.name,
            import: "Notice",
            props: { children: "Fallback" },
            children: ["Authored message"],
          },
          empty: {
            type: "element",
            tag: "p",
            props: { children: "Fallback" },
            children: [],
          },
        },
        { default: { slots: [[]] }, empty: { slots: [[]] } },
        { [theme.name]: theme },
      ),
      {
        dependencies: [theme],
        imports: { [theme.name]: { Notice } },
      },
    );

    expect(await renderToString(page.default as RemixNode)).toBe(
      "<aside>Authored message</aside>",
    );
    expect(await renderToString(page.empty as RemixNode)).toBe(
      "<p>Fallback</p>",
    );
  });

  it.each([
    {
      name: "a document needing an unavailable theme",
      version: 1,
      environment: undefined,
      diagnostics: [
        {
          severity: "error",
          code: "missing-environment-dependency",
          message: "Environment dependency @site/theme is missing.",
          dependency: "@site/theme",
        },
      ],
    },
    {
      name: "a theme from an incompatible application build",
      version: 1,
      environment: {
        dependencies: [{ ...theme, version: "2.0.0" }],
        imports: {},
      },
      diagnostics: [
        {
          severity: "error",
          code: "dependency-version-mismatch",
          message:
            "Environment dependency @site/theme has version 2.0.0, expected 1.2.3.",
          dependency: "@site/theme",
        },
      ],
    },
    {
      name: "a document from an unsupported CMX version",
      version: 2,
      environment: { dependencies: [theme], imports: {} },
      diagnostics: [
        {
          severity: "error",
          code: "unsupported-cmx-version",
          message: "Unsupported CMX document version 2.",
        },
      ],
    },
  ])(
    "rejects $name before reading content",
    ({ version, environment, diagnostics }) => {
      const document = {
        ...createDocument({}, {}, { [theme.name]: theme }),
        cmxVersion: version,
        get content(): never {
          throw new Error("Content was hydrated");
        },
      } as CmxDocument;

      try {
        cmx(document, environment);
      } catch (error) {
        expect(error).toBeInstanceOf(CmxError);
        expect(error).toBeInstanceOf(CmxRemixError);
        expect(error).toMatchObject({ name: "CmxRemixError", diagnostics });
        return;
      }
      throw new Error("Expected CMX contract verification to fail");
    },
  );

  it("reports a component missing from an otherwise compatible theme", () => {
    const document = createDocument(
      {
        default: {
          type: "component",
          from: theme.name,
          import: "MissingPanel",
        },
      },
      undefined,
      { [theme.name]: theme },
    );

    const hydrate = () =>
      cmx(document, { dependencies: [theme], imports: { [theme.name]: {} } });

    expect(hydrate).toThrow(CmxError);
    expect(hydrate).toThrow(
      "CMX import binding missing: @site/theme#MissingPanel",
    );
  });

  it("reports a missing theme export named constructor", () => {
    const document = createDocument(
      {
        default: {
          type: "component",
          from: theme.name,
          import: "constructor",
        },
      },
      undefined,
      { [theme.name]: theme },
    );

    const hydrate = () =>
      cmx(document, { dependencies: [theme], imports: { [theme.name]: {} } });

    expect(hydrate).toThrow(CmxError);
    expect(hydrate).toThrow(
      "CMX import binding missing: @site/theme#constructor",
    );
  });

  it("reports a theme source inherited instead of supplied by the environment", () => {
    function Panel() {
      return () => createElement("section", {}, "Panel");
    }
    const document = createDocument(
      {
        default: {
          type: "component",
          from: theme.name,
          import: "Panel",
        },
      },
      undefined,
      { [theme.name]: theme },
    );
    const environment: CmxEnvironment = {
      dependencies: [theme],
      imports: Object.create({ [theme.name]: { Panel } }),
    };

    const hydrate = () => cmx(document, environment);

    expect(hydrate).toThrow(CmxError);
    expect(hydrate).toThrow("CMX import binding missing: @site/theme#Panel");
  });

  it("keeps native client entries available to the Remix server renderer", async () => {
    const Counter = clientEntry(
      "/assets/counter.js#Counter",
      function Counter(handle: Handle<{ label: string }>) {
        return () =>
          createElement("button", { type: "button" }, handle.props.label);
      },
    );
    const page = cmx<{ default: CmxNode }>(
      createDocument(
        {
          default: {
            type: "component",
            from: theme.name,
            import: "Counter",
            props: { label: "Count" },
          },
        },
        undefined,
        { [theme.name]: theme },
      ),
      {
        dependencies: [theme],
        imports: { [theme.name]: { Counter } },
      },
    );

    const html = await renderToString(page.default);

    expect(html).toContain('<button type="button">Count</button>');
    expect(html).toContain('"moduleUrl":"/assets/counter.js"');
    expect(html).toContain('"exportName":"Counter"');
  });

  it("infers native nodes and ordinary data in optional named exports", async () => {
    const environment: CmxEnvironment<{
      default: CmxNode;
      meta?: { title: string; badges: CmxNode[] };
      teaser?: unknown;
    }> = { dependencies: [], imports: {} };
    const page = cmx(
      createDocument(
        {
          default: "Page",
          meta: {
            title: "About",
            badges: [{ type: "element", tag: "b", children: ["New"] }],
          },
        },
        { default: { slots: [[]] }, meta: { slots: [["badges", 0]] } },
      ),
      environment,
    );

    expectTypeOf(page.default).toEqualTypeOf<RemixNode>();
    expectTypeOf(page.meta).toEqualTypeOf<
      { title: string; badges: RemixNode[] } | undefined
    >();
    expectTypeOf(page.teaser).toEqualTypeOf<unknown>();
    expect(await renderToString(page.meta?.badges)).toBe("<b>New</b>");
  });
});

function createDocument(
  content: CmxDocument["content"],
  exports: CmxDocument["interface"]["exports"] = { default: { slots: [[]] } },
  imports: CmxDocument["interface"]["imports"] = {},
): CmxDocument {
  return {
    $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
    cmxVersion: 1,
    interface: { imports, exports },
    content,
  };
}
