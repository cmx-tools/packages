import { describe, expect, it } from "vitest";
import {
  verifyCmxDocumentEnvironment,
  type CmxDocument,
  type CmxDependency,
  type CmxEnvironment,
} from "@cmx-tools/contracts";

describe("verifyCmxDocumentEnvironment", () => {
  it("accepts a compatible document and environment", () => {
    expect(
      verifyCmxDocumentEnvironment(
        createDocument({
          imports: [
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
              version: "1.2.3",
            },
            {
              name: "@site/analytics",
              specifier: "workspace:*",
              version: "3.0.0",
            },
          ],
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
          imports: [
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
          imports: [
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
          imports: [
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
  ])(
    "reports dependency integrity $name",
    (input: {
      name: string;
      documentDependency: CmxDependency;
      environmentDependency: CmxDependency;
    }) => {
      expect(
        verifyCmxDocumentEnvironment(
          createDocument({
            imports: [input.documentDependency],
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
    },
  );

  it("does not inspect content or environment imports", () => {
    const document = {
      $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
      cmxVersion: 1,
      interface: {
        imports: {
          "@site/theme": {
            name: "@site/theme",
            specifier: "^1.0.0",
            version: "1.2.3",
          },
        },
        exports: {},
      },
      get content(): never {
        throw new Error("content was inspected");
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
    } as CmxEnvironment;

    expect(verifyCmxDocumentEnvironment(document, environment)).toEqual({
      valid: true,
    });
  });
});

type TestDocumentOptions = Partial<CmxDocument> & {
  imports?: CmxDependency[];
};

function createDocument(options: TestDocumentOptions = {}): CmxDocument {
  const { imports = [], ...documentOptions } = options;
  return {
    $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
    cmxVersion: 1,
    interface: {
      imports: Object.fromEntries(
        imports.map((dependency) => [dependency.name, dependency]),
      ),
      exports: {
        default: {
          type: {
            from: "@cmx-tools/contracts",
            import: "CmxNode",
          },
          slots: [[]],
        },
      },
    },
    content: {
      default: {
        type: "component",
        from: "@site/theme/button",
        import: "Button",
      },
    },
    ...documentOptions,
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
