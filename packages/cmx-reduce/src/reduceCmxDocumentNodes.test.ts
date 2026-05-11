import { describe, expect, it } from "vitest";
import type { CmxDocument, CmxNode } from "cmx-contracts";
import { reduceCmxDocumentNodes } from "cmx-reduce";

const documentFixture: CmxDocument = {
  $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
  cmxVersion: 1,
  interface: {
    imports: {},
    exports: {
      default: {
        slots: [[]],
      },
      meta: {
        slots: [["node"]],
      },
    },
  },
  content: {
    default: {
      type: "component",
      from: "@example/ui",
      props: {
        ignoredNodeLike: { type: "element", tag: "script" },
        body: {
          type: "element",
          tag: "article",
          props: {
            slotted: { type: "element", tag: "small" },
            notSlotted: { type: "element", tag: "aside" },
          },
          slots: [["props", "slotted"]],
        },
      },
      slots: [["props", "body"]],
      children: [{ type: "element", tag: "main" }],
    },
    meta: {
      node: { type: "element", tag: "footer" },
      ignoredNodeLike: { type: "element", tag: "script" },
    },
    notExported: {
      type: "element",
      tag: "div",
    },
  },
};

describe("reduceCmxDocumentNodes", () => {
  it("starts only from declared export slots", async () => {
    const seen: string[] = [];
    await reduceCmxDocumentNodes({
      document: documentFixture,
      context: seen,
      reduceNode(node, context) {
        if (typeof node === "object" && node !== null && "type" in node) {
          context.push((node as { type: string }).type);
        }
        return node;
      },
    });

    expect(seen).toContain("component");
    expect(seen).not.toContain("div");
  });

  it("reduces root export only when empty slot path is declared", async () => {
    const withoutRootSlot: CmxDocument = {
      ...documentFixture,
      interface: {
        ...documentFixture.interface,
        exports: {
          ...documentFixture.interface.exports,
          default: { slots: [["props", "body"]] },
        },
      },
    };

    const seen: string[] = [];
    await reduceCmxDocumentNodes({
      document: withoutRootSlot,
      context: seen,
      reduceNode(node, context) {
        if (typeof node === "object" && node !== null && "type" in node) {
          context.push((node as { type: string }).type);
        }
        return node;
      },
    });

    expect(seen[0]).toBe("element");
    expect(seen).not.toContain("component");
  });

  it("does not shape-scan arbitrary objects", async () => {
    const seenTags: string[] = [];

    await reduceCmxDocumentNodes({
      document: documentFixture,
      context: seenTags,
      reduceNode(node, context) {
        if (typeof node === "object" && node !== null && "tag" in node) {
          context.push(String((node as { tag: string }).tag));
        }
        return node;
      },
    });

    expect(seenTags).toContain("small");
    expect(seenTags).toContain("main");
    expect(seenTags).not.toContain("script");
    expect(seenTags).not.toContain("aside");
  });

  it("visits node first and traverses replacement subtree", async () => {
    const seen: string[] = [];

    await reduceCmxDocumentNodes({
      document: documentFixture,
      context: seen,
      reduceNode(node, context) {
        if (typeof node !== "object" || node === null || !("type" in node)) {
          return node;
        }

        if (node.type === "element" && node.tag === "article") {
          context.push("visit:article");
          return {
            type: "element",
            tag: "section",
            children: [{ type: "element", tag: "strong" }],
          } as CmxNode;
        }

        if (node.type === "component") {
          context.push("visit:component");
        } else if (node.type === "element") {
          context.push(`visit:${node.tag}`);
        } else {
          context.push("visit:fragment");
        }
        return node;
      },
    });

    expect(seen).toContain("visit:article");
    expect(seen).toContain("visit:strong");
    expect(seen).not.toContain("visit:small");
  });

  it("preserves typed context", async () => {
    const result = await reduceCmxDocumentNodes({
      document: documentFixture,
      context: { count: 0 },
      reduceNode(node, context) {
        if (typeof node === "object" && node !== null && "type" in node) {
          context.count += 1;
        }
        return node;
      },
    });

    expect(result.context.count).toBeGreaterThan(0);
  });
});
