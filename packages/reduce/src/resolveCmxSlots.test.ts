import { describe, expect, it } from "vitest";
import { resolveCmxSlots } from "@cmx-tools/reduce";

describe("resolveCmxSlots", () => {
  it("resolves a root slot for one owner value", () => {
    const owner = {
      type: "element",
      tag: "strong",
      children: ["Root"],
    };

    const resolved = resolveCmxSlots(owner, [[]], (node) => ({
      value: { rendered: node },
    }));

    expect(resolved).toEqual({
      rendered: owner,
    });
  });

  it("resolves nested object and array slots without mutating input", () => {
    const untouched = { label: "Keep" };
    const owner = {
      title: "Card",
      slots: {
        header: {
          type: "element",
          tag: "h2",
          children: ["Title"],
        },
        list: [
          untouched,
          {
            type: "element",
            tag: "span",
            children: ["Item"],
          },
        ],
      },
    };

    const resolved = resolveCmxSlots(
      owner,
      [
        ["slots", "header"],
        ["slots", "list", 1],
      ],
      (node) => ({
        value: {
          rendered: node,
        },
      }),
    );

    expect(resolved).toEqual({
      title: "Card",
      slots: {
        header: {
          rendered: {
            type: "element",
            tag: "h2",
            children: ["Title"],
          },
        },
        list: [
          untouched,
          {
            rendered: {
              type: "element",
              tag: "span",
              children: ["Item"],
            },
          },
        ],
      },
    });
    expect(owner.slots.header).toEqual({
      type: "element",
      tag: "h2",
      children: ["Title"],
    });
    expect((resolved as typeof owner).slots.list[0]).toBe(untouched);
  });

  it("accepts returned slots without resolving them in the same pass", () => {
    const nestedNode = {
      type: "element",
      tag: "em",
      children: ["Nested"],
    };
    const owner = {
      callout: {
        type: "component",
        from: "@example/ui",
        props: {
          icon: nestedNode,
        },
        slots: [["icon"]],
      },
    };

    const resolved = resolveCmxSlots(owner, [["callout"]], (node) => ({
      value: {
        rendered: node,
      },
      slots: [["rendered", "props", "icon"]],
    }));

    expect(resolved).toEqual({
      callout: {
        rendered: {
          type: "component",
          from: "@example/ui",
          props: {
            icon: nestedNode,
          },
          slots: [["icon"]],
        },
      },
    });
  });

  it("leaves unlisted node-shaped values untouched", () => {
    const unlistedNode = {
      type: "element",
      tag: "small",
      children: ["Data"],
    };
    const owner = {
      selected: {
        type: "element",
        tag: "strong",
        children: ["Selected"],
      },
      unlisted: unlistedNode,
    };

    const resolved = resolveCmxSlots(owner, [["selected"]], (node) => ({
      value: {
        rendered: node,
      },
    }));

    expect(resolved).toEqual({
      selected: {
        rendered: {
          type: "element",
          tag: "strong",
          children: ["Selected"],
        },
      },
      unlisted: unlistedNode,
    });
    expect((resolved as typeof owner).unlisted).toBe(unlistedNode);
  });
});
