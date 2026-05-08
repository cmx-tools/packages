import { Fragment, isValidElement } from "react";
import { describe, expect, it } from "vitest";
import {
  verifyCmxDocumentEnvironment,
  type CmxDependency,
  type CmxDocument,
  type CmxEnvironment,
  type CmxNode,
} from "cmx-contracts";
import { CmxReactError, cmx } from "cmx-react";

describe("cmx", () => {
  it.each([null, true, false, 7, "text"])(
    "hydrates primitive default export %s",
    (defaultExport) => {
      expect(cmx(createDocument({ defaultExport })).default).toBe(
        defaultExport,
      );
    },
  );

  it("hydrates optional meta export into page export map", () => {
    const result = cmx(
      createDocument({
        metaExport: {
          title: "About",
        },
      }),
    ) as { meta?: { title: string } };

    expect(result.meta).toEqual({
      title: "About",
    });
  });

  it("hydrates a pure CMX document default export into React values", () => {
    const document = createDocument({
      defaultExport: {
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

    expect(isValidElement(result.default)).toBe(true);
    if (!isValidElement(result.default)) {
      throw new Error("CMX fragment did not hydrate to a React element");
    }

    expect(result.default.type).toBe(Fragment);
    const fragmentProps = result.default.props as { children: unknown[] };
    const fragmentChildren = fragmentProps.children;
    const heading = fragmentChildren[1];
    expect(fragmentChildren[0]).toBe("prefix");
    expect(isValidElement(heading)).toBe(true);
    if (!isValidElement(heading)) {
      throw new Error("CMX heading did not materialize to a React element");
    }
    expect(heading.type).toBe("h1");
    expect(heading.props).toEqual({
      className: "title",
      children: "Not Found",
    });
  });

  it("throws contract diagnostics before hydrating incompatible documents", () => {
    const dependency = themeDependency();
    const document = {
      ...createDocument({
        imports: [dependency],
      }),
      get content(): never {
        throw new Error("content was hydrated");
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

  it("hydrates component nodes from named environment imports", () => {
    function Header() {
      return null;
    }
    const document = createDocument({
      imports: [themeDependency()],
      defaultExport: {
        type: "component",
        from: "@site/theme",
        import: "Header",
      },
    });
    const environment = createEnvironment({
      dependencies: Object.values(document.interface.imports),
      imports: {
        "@site/theme": {
          Header,
        },
      },
    });

    const result = cmx(document, environment);

    expect(isValidElement(result.default)).toBe(true);
    if (!isValidElement(result.default)) {
      throw new Error("CMX component did not hydrate to a React element");
    }

    expect(result.default.type).toBe(Header);
  });

  it("hydrates component nodes from default environment imports", () => {
    function Card() {
      return null;
    }
    const document = createDocument({
      imports: [themeDependency()],
      defaultExport: {
        type: "component",
        from: "@site/theme",
      },
    });
    const environment = createEnvironment({
      dependencies: Object.values(document.interface.imports),
      imports: {
        "@site/theme": {
          default: Card,
        },
      },
    });

    const result = cmx(document, environment);

    expect(isValidElement(result.default)).toBe(true);
    if (!isValidElement(result.default)) {
      throw new Error("CMX component did not hydrate to a React element");
    }

    expect(result.default.type).toBe(Card);
  });

  it("passes CMX node children as React children", () => {
    function Panel() {
      return null;
    }
    const document = createDocument({
      imports: [themeDependency()],
      defaultExport: {
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
      dependencies: Object.values(document.interface.imports),
      imports: {
        "@site/theme": {
          Panel,
        },
      },
    });

    const result = cmx(document, environment);

    expect(isValidElement(result.default)).toBe(true);
    if (!isValidElement(result.default)) {
      throw new Error("CMX component did not hydrate to a React element");
    }

    expect(result.default.props).toEqual({
      children: "node child",
      tone: "info",
    });
  });

  it("keeps props.children as a normal prop when node children are absent", () => {
    function Panel() {
      return null;
    }
    const document = createDocument({
      imports: [themeDependency()],
      defaultExport: {
        type: "component",
        from: "@site/theme",
        import: "Panel",
        props: {
          children: "prop child",
        },
      },
    });
    const environment = createEnvironment({
      dependencies: Object.values(document.interface.imports),
      imports: {
        "@site/theme": {
          Panel,
        },
      },
    });

    const result = cmx(document, environment);

    expect(isValidElement(result.default)).toBe(true);
    if (!isValidElement(result.default)) {
      throw new Error("CMX component did not hydrate to a React element");
    }

    expect(result.default.props).toEqual({
      children: "prop child",
    });
  });

  it("hydrates CMX nodes in prop slots before creating React elements", () => {
    function Panel() {
      return null;
    }
    const document = createDocument({
      imports: [themeDependency()],
      defaultExport: {
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
      dependencies: Object.values(document.interface.imports),
      imports: {
        "@site/theme": {
          Panel,
        },
      },
    });

    const result = cmx(document, environment);

    expect(isValidElement(result.default)).toBe(true);
    if (!isValidElement(result.default)) {
      throw new Error("CMX component did not hydrate to a React element");
    }

    const slotProps = result.default.props as {
      tone: string;
      icon: unknown;
    };
    expect(slotProps.tone).toBe("info");
    expect(isValidElement(slotProps.icon)).toBe(true);
    if (!isValidElement(slotProps.icon)) {
      throw new Error("CMX slot did not materialize to a React element");
    }
    expect(slotProps.icon.type).toBe("strong");
    expect(slotProps.icon.props).toEqual({
      children: "Icon",
    });
  });

  it("hydrates root default export slot", () => {
    const document = createDocument({
      defaultExport: {
        type: "element",
        tag: "strong",
        children: ["Featured"],
      },
      defaultSlots: [[]],
    });

    const result = cmx(document);

    expect(isValidElement(result.default)).toBe(true);
    if (!isValidElement(result.default)) {
      throw new Error(
        "CMX root default slot did not hydrate to a React element",
      );
    }

    expect(result.default.type).toBe("strong");
    expect(result.default.props).toEqual({
      children: "Featured",
    });
  });

  it("passes component implementations to React without pre-validation", () => {
    const invalidComponent = {};
    const document = createDocument({
      imports: [themeDependency()],
      defaultExport: {
        type: "component",
        from: "@site/theme",
        import: "InvalidComponent",
      },
    });
    const environment = createEnvironment({
      dependencies: Object.values(document.interface.imports),
      imports: {
        "@site/theme": {
          InvalidComponent: invalidComponent,
        },
      },
    });

    const result = cmx(document, environment);

    expect(isValidElement(result.default)).toBe(true);
    if (!isValidElement(result.default)) {
      throw new Error("CMX component did not hydrate to a React element");
    }

    expect(result.default.type).toBe(invalidComponent);
  });

  it("keeps native hydration errors unwrapped", () => {
    const hydrationError = new Error("content failed");
    const document = {
      ...createDocument(),
      get content(): never {
        throw hydrationError;
      },
    } as CmxDocument;

    expect(() => cmx(document, createEnvironment())).toThrow(hydrationError);
  });
});

type TestDocumentInput = {
  defaultExport?: CmxNode;
  defaultSlots?: CmxDocument["interface"]["exports"]["default"]["slots"];
  metaExport?: unknown;
  imports?: CmxDependency[];
};

function createDocument(input: TestDocumentInput = {}): CmxDocument {
  return {
    $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
    cmxVersion: 1,
    interface: {
      imports: Object.fromEntries(
        (input.imports ?? []).map((dependency) => [
          dependency.name,
          dependency,
        ]),
      ),
      exports: {
        default: {
          type: {
            from: "cmx-contracts",
            import: "CmxNode",
          },
          slots: input.defaultSlots ?? [[]],
        },
        ...(input.metaExport === undefined
          ? {}
          : {
              meta: {
                type: {
                  from: "@site/content",
                  import: "Meta",
                },
              },
            }),
      },
    },
    content: {
      default: input.defaultExport ?? null,
      ...(input.metaExport === undefined ? {} : { meta: input.metaExport }),
    },
  };
}

function createEnvironment<Meta = unknown>(
  environment: Partial<CmxEnvironment<Meta>> = {},
): CmxEnvironment<Meta> {
  return {
    dependencies: [],
    imports: {},
    ...environment,
  };
}

function themeDependency(): CmxDependency {
  return {
    name: "@site/theme",
    specifier: "^1.0.0",
    version: "1.2.3",
  };
}
