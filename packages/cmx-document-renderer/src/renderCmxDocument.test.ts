import { describe, expect, it } from "vitest";
import { renderCmxDocument } from "cmx-document-renderer";

describe("cmx-document-renderer", () => {
  it("executes a hand-written prepared bundle into a document", async () => {
    await expect(
      renderCmxDocument({
        moduleUrl: new URL("./prepared-bundle.fixture.ts", import.meta.url),
        exports: {
          default: {
            required: true,
            type: {
              from: "cmx-contracts",
              import: "CmxNode",
            },
          },
        },
      }),
    ).resolves.toEqual({
      document: {
        $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
        cmxVersion: 1,
        interface: {
          imports: {},
          exports: {
            default: {
              type: {
                from: "cmx-contracts",
                import: "CmxNode",
              },
              slots: [[]],
            },
          },
        },
        content: {
          default: {
            type: "element",
            tag: "main",
            children: ["Hello"],
          },
        },
      },
    });
  });

  it("renders configured optional exports through the same export map path", async () => {
    await expect(
      renderCmxDocument({
        moduleUrl: new URL("./prepared-bundle.fixture.ts", import.meta.url),
        exports: {
          default: {
            required: true,
            type: {
              from: "cmx-contracts",
              import: "CmxNode",
            },
          },
          teaser: {
            required: false,
            type: {
              from: "@example/backend-contract",
              import: "Teaser",
            },
          },
        },
        sourceExports: {
          teaser: {
            type: {
              from: "@example/backend-contract",
              import: "Teaser",
            },
          },
        },
      }),
    ).resolves.toEqual({
      document: {
        $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
        cmxVersion: 1,
        interface: {
          imports: {},
          exports: {
            default: {
              type: {
                from: "cmx-contracts",
                import: "CmxNode",
              },
              slots: [[]],
            },
            teaser: {
              type: {
                from: "@example/backend-contract",
                import: "Teaser",
              },
            },
          },
        },
        content: {
          default: {
            type: "element",
            tag: "main",
            children: ["Hello"],
          },
          teaser: {
            heading: "Hello",
          },
        },
      },
    });
  });

  it("includes type contract packages in document interface imports", async () => {
    await expect(
      renderCmxDocument({
        moduleUrl: new URL("./prepared-bundle.fixture.ts", import.meta.url),
        exports: {
          teaser: {
            required: false,
            type: {
              from: "@example/backend-contract",
              import: "Teaser",
            },
          },
        },
        sourceExports: {
          teaser: {
            type: {
              from: "@example/backend-contract",
              import: "Teaser",
            },
          },
        },
        dependencies: [
          {
            name: "@example/backend-contract",
            specifier: "workspace:*",
            version: "0.1.0",
          },
          {
            name: "@theme/ui",
            specifier: "^1.0.0",
            version: "1.2.3",
          },
        ],
      }),
    ).resolves.toEqual({
      document: {
        $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
        cmxVersion: 1,
        interface: {
          imports: {
            "@example/backend-contract": {
              name: "@example/backend-contract",
              specifier: "workspace:*",
              version: "0.1.0",
            },
          },
          exports: {
            teaser: {
              type: {
                from: "@example/backend-contract",
                import: "Teaser",
              },
            },
          },
        },
        content: {
          teaser: {
            heading: "Hello",
          },
        },
      },
    });
  });

  it("captures nested CMX slots on non-default exports", async () => {
    await expect(
      renderCmxDocument({
        moduleUrl: new URL("./prepared-bundle.fixture.ts", import.meta.url),
        exports: {
          default: {
            required: true,
            type: {
              from: "cmx-contracts",
              import: "CmxNode",
            },
          },
          meta: {
            required: false,
            type: {
              from: "@example/backend-contract",
              import: "Meta",
            },
          },
        },
        sourceExports: {
          meta: {
            type: {
              from: "@example/backend-contract",
              import: "Meta",
            },
          },
        },
      }),
    ).resolves.toEqual({
      document: {
        $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
        cmxVersion: 1,
        interface: {
          imports: {},
          exports: {
            default: {
              type: {
                from: "cmx-contracts",
                import: "CmxNode",
              },
              slots: [[]],
            },
            meta: {
              type: {
                from: "@example/backend-contract",
                import: "Meta",
              },
              slots: [["accessory"]],
            },
          },
        },
        content: {
          default: {
            type: "element",
            tag: "main",
            children: ["Hello"],
          },
          meta: {
            title: "Hello",
            accessory: {
              type: "element",
              tag: "strong",
              children: ["Meta slot"],
            },
          },
        },
      },
    });
  });

  it("fails required typed export when configured type cannot be verified", async () => {
    await expect(
      renderCmxDocument({
        moduleUrl: new URL("./prepared-bundle.fixture.ts", import.meta.url),
        exports: {
          teaser: {
            required: true,
            type: {
              from: "@example/backend-contract",
              import: "Teaser",
            },
          },
        },
      }),
    ).rejects.toMatchObject({
      diagnostic: {
        severity: "error",
        code: "render-error",
        message: "Configured type for teaser export could not be verified.",
      },
    });
  });

  it("omits optional typed export when unverifiedOptionalExports is omit", async () => {
    await expect(
      renderCmxDocument({
        moduleUrl: new URL("./prepared-bundle.fixture.ts", import.meta.url),
        exports: {
          teaser: {
            required: false,
            type: {
              from: "@example/backend-contract",
              import: "Teaser",
            },
          },
        },
        unverifiedOptionalExports: "omit",
      }),
    ).resolves.toEqual({
      document: {
        $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
        cmxVersion: 1,
        interface: {
          imports: {},
          exports: {},
        },
        content: {},
      },
    });
  });
});
