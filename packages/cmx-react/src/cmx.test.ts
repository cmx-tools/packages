import { Fragment, isValidElement } from "react";
import { describe, expect, it } from "vitest";
import {
  verifyCmxDocumentEnvironment,
  type CmxDocument,
  type CmxEnvironment,
} from "cmx-contracts";
import { CmxReactError, cmx } from "cmx-react";

describe("cmx", () => {
  it.each([null, true, false, 7, "text"])(
    "materializes primitive node %s",
    (tree) => {
      expect(cmx(createDocument({ tree })).children).toBe(tree);
    },
  );

  it("materializes a pure CMX document into React values", () => {
    const document = createDocument({
      meta: {
        data: {
          title: "Fallback",
        },
      },
      tree: {
        type: "fragment",
        children: [
          "prefix",
          {
            type: "element",
            tag: "h1",
            props: {
              className: "title",
            },
            children: ["Not Found"],
          },
        ],
      },
    });

    const result = cmx(document);

    expect(result.meta).toEqual({
      title: "Fallback",
    });
    expect(isValidElement(result.children)).toBe(true);
    if (!isValidElement(result.children)) {
      throw new Error("CMX fragment did not materialize to a React element");
    }

    expect(result.children.type).toBe(Fragment);
    const fragmentChildren = result.children.props.children;
    expect(fragmentChildren[0]).toBe("prefix");
    expect(isValidElement(fragmentChildren[1])).toBe(true);
    expect(fragmentChildren[1].type).toBe("h1");
    expect(fragmentChildren[1].props).toEqual({
      className: "title",
      children: "Not Found",
    });
  });

  it("throws contract diagnostics before materializing incompatible documents", () => {
    const document = {
      ...createDocument(),
      dependencies: [
        {
          name: "@site/theme",
          specifier: "^1.0.0",
          version: "1.2.3",
        },
      ],
      get tree(): never {
        throw new Error("tree was materialized");
      },
    } as CmxDocument;
    const verification = verifyCmxDocumentEnvironment(document);
    if (verification.valid) {
      throw new Error("Expected document verification to fail");
    }

    expect(() => cmx(document)).toThrow(CmxReactError);

    try {
      cmx(document);
    } catch (error) {
      expect(error).toBeInstanceOf(CmxReactError);
      expect((error as CmxReactError).diagnostics).toEqual([
        {
          severity: "error",
          code: "missing-environment-dependency",
          message: "Environment dependency @site/theme is missing.",
          dependency: "@site/theme",
        },
      ]);
      return;
    }

    throw new Error("Expected cmx to throw");
  });

  it("materializes component nodes from named environment imports", () => {
    function Header() {
      return null;
    }
    const document = createDocument({
      dependencies: [
        {
          name: "@site/theme",
          specifier: "^1.0.0",
          version: "1.2.3",
        },
      ],
      tree: {
        type: "component",
        from: "@site/theme",
        import: "Header",
      },
    });
    const environment = createEnvironment({
      dependencies: document.dependencies,
      imports: {
        "@site/theme": {
          Header,
        },
      },
    });

    const result = cmx(document, environment);

    expect(isValidElement(result.children)).toBe(true);
    if (!isValidElement(result.children)) {
      throw new Error("CMX component did not materialize to a React element");
    }

    expect(result.children.type).toBe(Header);
  });

  it("materializes component nodes from default environment imports", () => {
    function Card() {
      return null;
    }
    const document = createDocument({
      dependencies: [
        {
          name: "@site/theme",
          specifier: "^1.0.0",
          version: "1.2.3",
        },
      ],
      tree: {
        type: "component",
        from: "@site/theme",
      },
    });
    const environment = createEnvironment({
      dependencies: document.dependencies,
      imports: {
        "@site/theme": {
          default: Card,
        },
      },
    });

    const result = cmx(document, environment);

    expect(isValidElement(result.children)).toBe(true);
    if (!isValidElement(result.children)) {
      throw new Error("CMX component did not materialize to a React element");
    }

    expect(result.children.type).toBe(Card);
  });

  it("passes CMX node children as React children", () => {
    function Panel() {
      return null;
    }
    const document = createDocument({
      dependencies: [
        {
          name: "@site/theme",
          specifier: "^1.0.0",
          version: "1.2.3",
        },
      ],
      tree: {
        type: "component",
        from: "@site/theme",
        import: "Panel",
        props: {
          children: "prop child",
          tone: "info",
        },
        children: ["node child"],
      },
    });
    const environment = createEnvironment({
      dependencies: document.dependencies,
      imports: {
        "@site/theme": {
          Panel,
        },
      },
    });

    const result = cmx(document, environment);

    expect(isValidElement(result.children)).toBe(true);
    if (!isValidElement(result.children)) {
      throw new Error("CMX component did not materialize to a React element");
    }

    expect(result.children.props).toEqual({
      children: "node child",
      tone: "info",
    });
  });

  it("keeps props.children as a normal prop when node children are absent", () => {
    function Panel() {
      return null;
    }
    const document = createDocument({
      dependencies: [
        {
          name: "@site/theme",
          specifier: "^1.0.0",
          version: "1.2.3",
        },
      ],
      tree: {
        type: "component",
        from: "@site/theme",
        import: "Panel",
        props: {
          children: "prop child",
        },
      },
    });
    const environment = createEnvironment({
      dependencies: document.dependencies,
      imports: {
        "@site/theme": {
          Panel,
        },
      },
    });

    const result = cmx(document, environment);

    expect(isValidElement(result.children)).toBe(true);
    if (!isValidElement(result.children)) {
      throw new Error("CMX component did not materialize to a React element");
    }

    expect(result.children.props).toEqual({
      children: "prop child",
    });
  });

  it("materializes CMX nodes in prop slots before creating React elements", () => {
    function Panel() {
      return null;
    }
    const document = createDocument({
      dependencies: [
        {
          name: "@site/theme",
          specifier: "^1.0.0",
          version: "1.2.3",
        },
      ],
      tree: {
        type: "component",
        from: "@site/theme",
        import: "Panel",
        props: {
          icon: {
            type: "element",
            tag: "strong",
            children: ["Icon"],
          },
          tone: "info",
        },
        slots: [["icon"]],
      },
    });
    const environment = createEnvironment({
      dependencies: document.dependencies,
      imports: {
        "@site/theme": {
          Panel,
        },
      },
    });

    const result = cmx(document, environment);

    expect(isValidElement(result.children)).toBe(true);
    if (!isValidElement(result.children)) {
      throw new Error("CMX component did not materialize to a React element");
    }

    expect(result.children.props.tone).toBe("info");
    expect(isValidElement(result.children.props.icon)).toBe(true);
    expect(result.children.props.icon.type).toBe("strong");
    expect(result.children.props.icon.props).toEqual({
      children: "Icon",
    });
  });

  it("passes component implementations to React without pre-validation", () => {
    const invalidComponent = {};
    const document = createDocument({
      dependencies: [
        {
          name: "@site/theme",
          specifier: "^1.0.0",
          version: "1.2.3",
        },
      ],
      tree: {
        type: "component",
        from: "@site/theme",
        import: "InvalidComponent",
      },
    });
    const environment = createEnvironment({
      dependencies: document.dependencies,
      imports: {
        "@site/theme": {
          InvalidComponent: invalidComponent,
        },
      },
    });

    const result = cmx(document, environment);

    expect(isValidElement(result.children)).toBe(true);
    if (!isValidElement(result.children)) {
      throw new Error("CMX component did not materialize to a React element");
    }

    expect(result.children.type).toBe(invalidComponent);
  });

  it("keeps native materialization errors unwrapped", () => {
    const materializationError = new Error("tree failed");
    const document = {
      ...createDocument(),
      get tree(): never {
        throw materializationError;
      },
    } as CmxDocument;

    expect(() => cmx(document, createEnvironment())).toThrow(
      materializationError,
    );
  });
});

function createDocument(document: Partial<CmxDocument> = {}): CmxDocument {
  return {
    $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
    cmxVersion: 1,
    dependencies: [],
    tree: null,
    ...document,
  };
}

function createEnvironment(
  environment: Partial<CmxEnvironment> = {},
): CmxEnvironment {
  return {
    dependencies: [],
    imports: {},
    ...environment,
  };
}
