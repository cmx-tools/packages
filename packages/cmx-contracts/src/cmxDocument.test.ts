import { describe, expect, it } from "vitest";
import { isCmxDocument } from "./cmxDocument.js";

const documentFixture = {
  $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
  cmxVersion: 1,
  interface: { imports: {}, exports: {} },
  content: { default: { type: "element", tag: "main" } },
};

describe("isCmxDocument", () => {
  it("returns true for rendered CMX document shape", () => {
    expect(isCmxDocument(documentFixture)).toBe(true);
  });

  it("returns false for non-document values", () => {
    expect(isCmxDocument({ foo: 1 })).toBe(false);
    expect(isCmxDocument(null)).toBe(false);
    expect(isCmxDocument([])).toBe(false);
    expect(
      isCmxDocument({
        ...documentFixture,
        interface: [],
      }),
    ).toBe(false);
    expect(
      isCmxDocument({
        ...documentFixture,
        content: [],
      }),
    ).toBe(false);
  });
});
