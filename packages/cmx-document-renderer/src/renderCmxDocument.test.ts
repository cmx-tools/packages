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
});
