import type {
  CmxDocument,
  CmxEnvironment,
  CmxNode,
} from "@cmx-tools/contracts";
import { cmx } from "@cmx-tools/react";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("cmx intrinsic props", () => {
  it("renders a CMX-authored form with standard HTML attribute names", () => {
    const document = createDocument({
      type: "element",
      tag: "form",
      props: { autocomplete: "off", novalidate: "", acceptCharset: "UTF-8" },
      children: [
        {
          type: "element",
          tag: "label",
          props: { class: "field", for: "email", tabindex: 0 },
          children: ["Email"],
        },
        {
          type: "element",
          tag: "input",
          props: {
            id: "email",
            type: "email",
            readonly: "",
            required: "",
            maxlength: 80,
          },
        },
      ],
    });
    const before = structuredClone(document);

    const page = cmx(document);

    expect(renderToStaticMarkup(page.default as ReactNode)).toBe(
      '<form autoComplete="off" noValidate="" accept-charset="UTF-8"><label class="field" for="email" tabindex="0">Email</label><input id="email" type="email" readOnly="" required="" maxLength="80"/></form>',
    );
    expect(document).toEqual(before);
  });
  it("renders trusted CMX raw markup through React's raw HTML prop", () => {
    const document = createDocument({
      type: "element",
      tag: "article",
      props: {
        class: "story",
        innerHTML: "<strong>Fresh &amp; local</strong>",
      },
    });

    const page = cmx(document);

    expect(renderToStaticMarkup(page.default as ReactNode)).toBe(
      '<article class="story"><strong>Fresh &amp; local</strong></article>',
    );
  });

  it("keeps React-authored props and style objects usable without copying their values", () => {
    const style = { color: "red", marginTop: 4 };
    const rawMarkup = { __html: "<strong>Hello</strong>" };
    const document = createDocument({
      type: "element",
      tag: "div",
      props: {
        className: "story",
        tabIndex: 0,
        style,
        dangerouslySetInnerHTML: rawMarkup,
      },
    });

    const page = cmx(document);
    if (
      !isValidElement<{ style: unknown; dangerouslySetInnerHTML: unknown }>(
        page.default,
      )
    ) {
      throw new Error("Expected a hydrated React element");
    }

    expect(page.default.props.style).toBe(style);
    expect(page.default.props.dangerouslySetInnerHTML).toBe(rawMarkup);
    expect(renderToStaticMarkup(page.default)).toBe(
      '<div class="story" tabindex="0" style="color:red;margin-top:4px"><strong>Hello</strong></div>',
    );
  });

  it("retains SVG spelling and conventional data and accessibility attributes", () => {
    const document = createDocument({
      type: "element",
      tag: "svg",
      props: {
        class: "logo",
        viewBox: "0 0 20 20",
        "aria-label": "Coffee",
        "data-version": "2",
      },
      children: [
        {
          type: "element",
          tag: "path",
          props: { d: "M2 10h16", strokeWidth: 2 },
        },
        { type: "element", tag: "use", props: { xlinkHref: "#bean" } },
      ],
    });

    expect(renderToStaticMarkup(cmx(document).default as ReactNode)).toBe(
      '<svg class="logo" viewBox="0 0 20 20" aria-label="Coffee" data-version="2"><path d="M2 10h16" stroke-width="2"></path><use xlink:href="#bean"></use></svg>',
    );
  });

  it("preserves the literal custom-element prop contract", () => {
    const props = {
      class: "cards",
      for: "coffee",
      tabindex: 0,
      disabled: "",
      "data-sku": "coffee",
    };
    const document = createDocument({
      type: "element",
      tag: "product-card",
      props,
    });

    const page = cmx(document);
    if (!isValidElement(page.default)) {
      throw new Error("Expected a hydrated custom React element");
    }

    expect(page.default.props).toEqual(props);
    expect(renderToStaticMarkup(page.default)).toBe(
      '<product-card class="cards" for="coffee" tabindex="0" disabled="" data-sku="coffee"></product-card>',
    );
  });

  it("adapts intrinsic slots while leaving a component's own prop vocabulary intact", () => {
    const dependency = {
      name: "@site/ui",
      specifier: "^1.0.0",
      version: "1.0.0",
    };
    let received: unknown;
    function Frame(props: {
      class: string;
      innerHTML: string;
      style: string;
      body: ReactNode;
    }) {
      received = props;
      return createElement("section", { className: props.class }, props.body);
    }
    const document = createDocument({
      type: "component",
      from: "@site/ui",
      import: "Frame",
      props: {
        class: "application",
        innerHTML: "component-owned value",
        style: "editorial",
        body: {
          type: "element",
          tag: "label",
          props: { class: "field", for: "coffee" },
          children: ["Coffee"],
        },
      },
      slots: [["body"]],
    });
    document.interface.imports = { "@site/ui": dependency };
    const environment: CmxEnvironment = {
      dependencies: [dependency],
      imports: { "@site/ui": { Frame } },
    };

    expect(
      renderToStaticMarkup(cmx(document, environment).default as ReactNode),
    ).toBe(
      '<section class="application"><label class="field" for="coffee">Coffee</label></section>',
    );
    expect(received).toMatchObject({
      class: "application",
      innerHTML: "component-owned value",
      style: "editorial",
    });
  });

  it("preserves declarative shadow-root Boolean attributes that React treats as unknown names", () => {
    const document = createDocument({
      type: "element",
      tag: "template",
      props: {
        shadowrootmode: "open",
        shadowrootclonable: true,
        shadowrootdelegatesfocus: false,
        shadowrootserializable: true,
      },
      children: [
        { type: "element", tag: "span", children: ["Shadow content"] },
      ],
    });

    expect(renderToStaticMarkup(cmx(document).default as ReactNode)).toBe(
      '<template shadowrootmode="open" shadowrootclonable="" shadowrootserializable=""><span>Shadow content</span></template>',
    );
  });

  it("renders standard image-map and writing-suggestion values absent from React's Boolean vocabulary", () => {
    const document = createDocument({
      type: "element",
      tag: "div",
      props: { writingsuggestions: false },
      children: [
        {
          type: "element",
          tag: "img",
          props: { ismap: true, alt: "Selectable map" },
        },
      ],
    });

    expect(renderToStaticMarkup(cmx(document).default as ReactNode)).toBe(
      '<div writingsuggestions="false"><img ismap="" alt="Selectable map"/></div>',
    );
  });

  it("parses CSS declarations containing quoted semicolons, URLs, and custom properties", () => {
    const document = createDocument({
      type: "element",
      tag: "div",
      props: {
        style:
          'COLOR: red; content: "fresh; local"; background-image: url("data:image/svg+xml;a;b"); --Coffee-Tone: brown; -webkit-line-clamp: 2; -ms-overflow-style: none',
      },
    });

    const page = cmx(document);
    if (!isValidElement<{ style: unknown }>(page.default)) {
      throw new Error("Expected a hydrated React element");
    }

    expect(page.default.props.style).toEqual({
      color: "red",
      content: '"fresh; local"',
      backgroundImage: 'url("data:image/svg+xml;a;b")',
      "--Coffee-Tone": " brown",
      WebkitLineClamp: "2",
      msOverflowStyle: "none",
    });
    expect(renderToStaticMarkup(page.default)).toBe(
      '<div style="color:red;content:&quot;fresh; local&quot;;background-image:url(&quot;data:image/svg+xml;a;b&quot;);--Coffee-Tone:brown;-webkit-line-clamp:2;-ms-overflow-style:none"></div>',
    );
  });

  it("passes CSS priorities and quoted priority text to React without changing the Document", () => {
    const document = createDocument({
      type: "element",
      tag: "div",
      props: {
        style:
          'color: red !IMPORTANT; --Coffee-Tone: brown !important; content: "!important"; outline: none !other',
      },
    });
    const before = structuredClone(document);

    const page = cmx(document);
    if (!isValidElement<{ style: unknown }>(page.default)) {
      throw new Error("Expected a hydrated React element");
    }

    expect(page.default.props.style).toEqual({
      color: "red !IMPORTANT",
      "--Coffee-Tone": " brown !important",
      content: '"!important"',
      outline: "none !other",
    });
    expect(renderToStaticMarkup(page.default)).toBe(
      '<div style="color:red !IMPORTANT;--Coffee-Tone:brown !important;content:&quot;!important&quot;;outline:none !other"></div>',
    );
    expect(document).toEqual(before);
  });

  it("preserves declaration order when later CSS longhands override a shorthand", () => {
    const document = createDocument({
      type: "element",
      tag: "div",
      props: {
        style:
          "margin-left:1px; invalid declaration; margin:2px; /* restored edge */ margin-left:3px",
      },
    });

    expect(renderToStaticMarkup(cmx(document).default as ReactNode)).toBe(
      '<div style="margin:2px;margin-left:3px"></div>',
    );
  });

  it("converts shared style and raw-markup props on custom tags while retaining their literal attribute names", () => {
    const document = createDocument({
      type: "element",
      tag: "product-card",
      props: {
        class: "coffee",
        for: "coffee",
        style: "color: red",
        innerHTML: "<strong>Fresh</strong>",
      },
    });

    expect(renderToStaticMarkup(cmx(document).default as ReactNode)).toBe(
      '<product-card class="coffee" for="coffee" style="color:red"><strong>Fresh</strong></product-card>',
    );
  });
});

function createDocument(node: CmxNode): CmxDocument {
  return {
    $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
    cmxVersion: 1,
    interface: { imports: {}, exports: { default: { slots: [[]] } } },
    content: { default: node },
  };
}
