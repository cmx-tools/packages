import { describe, expect, it } from "vitest";
import type { CmxDocument } from "@cmx-tools/contracts";
import {
  type CmxDocumentNodeVisitor,
  verifyCmxDocumentNodes,
} from "@cmx-tools/verify";

const documentFixture: CmxDocument = {
  $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
  cmxVersion: 1,
  interface: {
    imports: {},
    exports: {
      default: {
        slots: [[]],
      },
    },
  },
  content: {
    default: {
      type: "component",
      from: "@example/ui",
      props: {
        title: "Hello",
        body: {
          type: "element",
          tag: "article",
          props: {
            dangerouslySetInnerHTML: { __html: "<script>bad()</script>" },
          },
        },
      },
      slots: [["props", "body"]],
      children: [{ type: "element", tag: "main" }],
    },
  },
};

describe("verifyCmxDocumentNodes", () => {
  it("returns config-ready verifier in curried mode", async () => {
    const verifyDocument = verifyCmxDocumentNodes((node) => {
      if (typeof node === "object" && node !== null && "type" in node) {
        return {
          severity: "error",
          code: "node-seen",
          message: String((node as { type: string }).type),
        };
      }
      return null;
    });

    const result = await verifyDocument(documentFixture);

    expect(result.valid).toBe(false);
    if (result.valid) {
      return;
    }

    expect(result.diagnostics[0]?.code).toBe("node-seen");
  });

  it("supports rest-style visitors and collects all diagnostics", async () => {
    const result = await verifyCmxDocumentNodes(
      documentFixture,
      async () => [{ severity: "error", code: "v1", message: "first" }],
      () => [{ severity: "error", code: "v2", message: "second" }],
    );

    expect(result.valid).toBe(false);
    if (result.valid) {
      return;
    }

    expect(result.diagnostics.length).toBeGreaterThan(2);
    expect(result.diagnostics[0]).toEqual({
      severity: "error",
      code: "v1",
      message: "first",
    });
    expect(result.diagnostics[1]).toEqual({
      severity: "error",
      code: "v2",
      message: "second",
    });
  });

  it("supports array-style visitors", async () => {
    const result = await verifyCmxDocumentNodes(documentFixture, [
      () => [{ severity: "error", code: "a", message: "one" }],
      () => [{ severity: "error", code: "b", message: "two" }],
    ]);

    expect(result.valid).toBe(false);
    if (result.valid) {
      return;
    }

    expect(result.diagnostics[0]).toEqual({
      severity: "error",
      code: "a",
      message: "one",
    });
    expect(result.diagnostics[1]).toEqual({
      severity: "error",
      code: "b",
      message: "two",
    });
  });

  it("runs through reducer traversal including children and node slots", async () => {
    const seen: string[] = [];

    await verifyCmxDocumentNodes(documentFixture, (node) => {
      if (typeof node === "object" && node !== null && "type" in node) {
        seen.push((node as { type: string }).type);
      }
      return null;
    });

    expect(seen).toContain("component");
    expect(seen.filter((entry) => entry === "element").length).toBeGreaterThan(
      1,
    );
  });

  it("normalizes single and list diagnostics", async () => {
    const disallowDangerouslySetInnerHtml: CmxDocumentNodeVisitor = (node) => {
      if (typeof node !== "object" || node === null || !("props" in node)) {
        return null;
      }

      const props = (node as { props?: Record<string, unknown> }).props;
      if (props && "dangerouslySetInnerHTML" in props) {
        return {
          severity: "error",
          code: "disallow-dangerously-set-inner-html",
          message: "dangerouslySetInnerHTML is not allowed",
        };
      }

      return null;
    };

    const result = await verifyCmxDocumentNodes(
      documentFixture,
      disallowDangerouslySetInnerHtml,
    );

    expect(result).toEqual({
      valid: false,
      diagnostics: [
        {
          severity: "error",
          code: "disallow-dangerously-set-inner-html",
          message: "dangerouslySetInnerHTML is not allowed",
        },
      ],
    });
  });
});
