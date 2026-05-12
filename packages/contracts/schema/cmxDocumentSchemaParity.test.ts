import { describe, expectTypeOf, it } from "vitest";
import type { CmxDocument } from "../src/cmxDocument.js";
import type { CmxDocumentSchema } from "./cmx-document.v1.schema.generated.js";

describe("cmxDocument schema parity", () => {
  it("keeps CmxDocument type parity with generated schema type", () => {
    expectTypeOf<CmxDocument>().toEqualTypeOf<CmxDocumentSchema>();
    expectTypeOf<CmxDocumentSchema>().toEqualTypeOf<CmxDocument>();
  });
});
