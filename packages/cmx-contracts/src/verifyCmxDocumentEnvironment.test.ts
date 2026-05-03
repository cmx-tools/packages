import { describe, expect, it } from "vitest";
import {
  verifyCmxDocumentEnvironment,
  type CmxDocument,
  type CmxDependency,
  type CmxEnvironment,
} from "cmx-contracts";

describe("verifyCmxDocumentEnvironment", () => {
  it("accepts a compatible document and environment", () => {
    expect(
      verifyCmxDocumentEnvironment(
        createDocument({
          dependencies: [
            {
              name: "@site/content",
              specifier: "^0.1.0",
              version: "0.1.0",
            },
            {
              name: "@site/theme",
              specifier: "^1.0.0",
              version: "1.2.3",
            },
          ],
          meta: {
            type: {
              from: "@site/content",
              import: "PageMeta",
            },
            data: {
              title: "Home",
            },
          },
        }),
        createEnvironment({
          dependencies: [
            {
              name: "@site/content",
              specifier: "workspace:*",
              version: "0.1.0",
            },
            {
              name: "@site/theme",
              specifier: "workspace:*",
              version: "1.2.3",
            },
            {
              name: "@site/analytics",
              specifier: "workspace:*",
              version: "3.0.0",
            },
          ],
          metaType: {
            from: "@site/content",
            import: "PageMeta",
          },
        }),
      ),
    ).toEqual({
      valid: true,
    });
  });

  it("reports an unsupported document version", () => {
    expect(
      verifyCmxDocumentEnvironment(
        {
          ...createDocument(),
          /** @ts-expect-error - deliberately invalid */
          cmxVersion: 2,
        },
        createEnvironment(),
      ),
    ).toEqual({
      valid: false,
      diagnostics: [
        {
          severity: "error",
          code: "unsupported-cmx-version",
          message: "Unsupported CMX document version 2.",
        },
      ],
    });
  });

  it("accepts a dependency-free document without an environment", () => {
    expect(verifyCmxDocumentEnvironment(createDocument())).toEqual({
      valid: true,
    });
  });

  it("reports missing dependencies without an environment", () => {
    expect(
      verifyCmxDocumentEnvironment(
        createDocument({
          dependencies: [
            {
              name: "@site/theme",
              specifier: "^1.0.0",
              version: "1.2.3",
            },
          ],
        }),
      ),
    ).toEqual({
      valid: false,
      diagnostics: [
        {
          severity: "error",
          code: "missing-environment-dependency",
          message: "Environment dependency @site/theme is missing.",
          dependency: "@site/theme",
        },
      ],
    });
  });

  it("reports a missing environment dependency", () => {
    expect(
      verifyCmxDocumentEnvironment(
        createDocument({
          dependencies: [
            {
              name: "@site/theme",
              specifier: "^1.0.0",
              version: "1.2.3",
            },
          ],
        }),
        createEnvironment(),
      ),
    ).toEqual({
      valid: false,
      diagnostics: [
        {
          severity: "error",
          code: "missing-environment-dependency",
          message: "Environment dependency @site/theme is missing.",
          dependency: "@site/theme",
        },
      ],
    });
  });

  it("reports dependency version mismatch while ignoring specifier", () => {
    expect(
      verifyCmxDocumentEnvironment(
        createDocument({
          dependencies: [
            {
              name: "@site/theme",
              specifier: "^1.0.0",
              version: "1.2.3",
            },
          ],
        }),
        createEnvironment({
          dependencies: [
            {
              name: "@site/theme",
              specifier: "workspace:*",
              version: "1.2.4",
            },
          ],
        }),
      ),
    ).toEqual({
      valid: false,
      diagnostics: [
        {
          severity: "error",
          code: "dependency-version-mismatch",
          message:
            "Environment dependency @site/theme has version 1.2.4, expected 1.2.3.",
          dependency: "@site/theme",
        },
      ],
    });
  });

  it.each([
    {
      name: "mismatch",
      documentDependency: dependency({ integrity: "sha512-document" }),
      environmentDependency: dependency({ integrity: "sha512-environment" }),
    },
    {
      name: "document-only",
      documentDependency: dependency({ integrity: "sha512-document" }),
      environmentDependency: dependency(),
    },
    {
      name: "environment-only",
      documentDependency: dependency(),
      environmentDependency: dependency({ integrity: "sha512-environment" }),
    },
  ])("reports dependency integrity $name", (input) => {
    expect(
      verifyCmxDocumentEnvironment(
        createDocument({
          dependencies: [input.documentDependency],
        }),
        createEnvironment({
          dependencies: [input.environmentDependency],
        }),
      ),
    ).toEqual({
      valid: false,
      diagnostics: [
        {
          severity: "error",
          code: "dependency-integrity-mismatch",
          message:
            "Environment dependency @site/theme integrity does not match.",
          dependency: "@site/theme",
        },
      ],
    });
  });

  it.each([
    {
      name: "typed document meta without environment meta type",
      document: createDocument({
        meta: {
          type: {
            from: "@site/content",
            import: "PageMeta",
          },
          data: {},
        },
      }),
      environment: createEnvironment(),
    },
    {
      name: "untyped document meta with environment meta type",
      document: createDocument({
        meta: {
          data: {},
        },
      }),
      environment: createEnvironment({
        metaType: {
          from: "@site/content",
          import: "PageMeta",
        },
      }),
    },
    {
      name: "different document and environment meta types",
      document: createDocument({
        meta: {
          type: {
            from: "@site/content",
            import: "PageMeta",
          },
          data: {},
        },
      }),
      environment: createEnvironment({
        metaType: {
          from: "@site/content",
          import: "OtherMeta",
        },
      }),
    },
  ])("reports meta mismatch for $name", (input) => {
    expect(
      verifyCmxDocumentEnvironment(input.document, input.environment),
    ).toEqual({
      valid: false,
      diagnostics: [
        {
          severity: "error",
          code: "meta-type-mismatch",
          message: "Document meta type is not compatible with the environment.",
        },
      ],
    });
  });

  it("does not inspect imports or walk the document tree", () => {
    const document = {
      $schema: "https://cmx.dev/schemas/document.v1.json",
      cmxVersion: 1,
      dependencies: [
        {
          name: "@site/theme",
          specifier: "^1.0.0",
          version: "1.2.3",
        },
      ],
      get tree(): never {
        throw new Error("tree was inspected");
      },
    } as CmxDocument;
    const environment = {
      dependencies: [
        {
          name: "@site/theme",
          specifier: "workspace:*",
          version: "1.2.3",
        },
      ],
      get imports(): never {
        throw new Error("imports were inspected");
      },
      metaType: {
        from: "@site/content",
        import: "PageMeta",
      },
    } as CmxEnvironment;

    expect(verifyCmxDocumentEnvironment(document, environment)).toEqual({
      valid: true,
    });
  });
});

function createDocument(options: Partial<CmxDocument> = {}): CmxDocument {
  return {
    $schema: "https://cmx.dev/schemas/document.v1.json",
    cmxVersion: 1,
    dependencies: [],
    tree: {
      type: "component",
      from: "@site/theme/button",
      import: "Button",
    },
    ...options,
  };
}

function createEnvironment(
  options: Partial<CmxEnvironment> = {},
): CmxEnvironment {
  return {
    dependencies: [],
    imports: {},
    ...options,
  };
}

function dependency(options: Partial<CmxDependency> = {}): CmxDependency {
  return {
    name: "@site/theme",
    specifier: "^1.0.0",
    version: "1.2.3",
    ...options,
  };
}
