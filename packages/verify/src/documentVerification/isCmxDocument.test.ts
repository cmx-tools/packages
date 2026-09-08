import { describe, expect, expectTypeOf, it } from "vitest";
import type { CmxDocument } from "@cmx-tools/contracts";
import { isCmxDocument } from "@cmx-tools/verify";

describe("isCmxDocument", () => {
  it("narrows a loaded document for callers that only need acceptance", () => {
    const input: unknown = JSON.parse(`{
      "$schema": "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
      "cmxVersion": 1,
      "interface": { "imports": {}, "exports": { "title": {} } },
      "content": { "title": "Hello" }
    }`);
    expect(isCmxDocument(input)).toBe(true);
    if (!isCmxDocument(input)) throw new Error("Stored document was rejected");
    expectTypeOf(input).toEqualTypeOf<CmxDocument>();
    expect(input.content.title).toBe("Hello");
  });

  it("filters out persisted documents with stale export declarations", () => {
    const loaded: unknown[] = [
      {
        $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
        cmxVersion: 1,
        interface: { imports: {}, exports: { deleted: {} } },
        content: {},
      },
    ];
    const documents = loaded.filter(isCmxDocument);
    expectTypeOf(documents).toEqualTypeOf<CmxDocument[]>();
    expect(documents).toEqual([]);
  });
});
