import { describe, expect, it } from "vitest";
import { renderCmxDocument } from "cmx-document-renderer";

describe("cmx-document-renderer", () => {
  it("executes a hand-written prepared bundle into a document", async () => {
    await expect(
      renderCmxDocument({
        moduleUrl: new URL("./prepared-bundle.fixture.ts", import.meta.url),
      }),
    ).resolves.toEqual({
      document: {
        $schema: "https://example.org/todo.v1.json",
        cmxVersion: 1,
        dependencies: [],
        tree: {
          type: "element",
          tag: "main",
          children: ["Hello"],
        },
      },
    });
  });
});
