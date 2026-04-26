import { describe, expect, it } from "vitest";
import {
  __registerExternal,
  jsx,
  normalizeCmxTree,
  renderCmxTree,
} from "content-management-jsx/cmx-tree-renderer";

describe("cmx-tree-renderer", () => {
  it("normalizes a runtime-created element to plain CMX data", async () => {
    await expect(
      normalizeCmxTree(jsx("main", { children: "Hello" })),
    ).resolves.toEqual({
      type: "element",
      tag: "main",
      children: ["Hello"],
    });
  });

  it("normalizes external sentinels to component nodes", async () => {
    const Hero = __registerExternal({
      from: "@theme/ui",
      import: "Hero",
    });

    await expect(
      normalizeCmxTree(jsx(Hero, { tone: "primary" })),
    ).resolves.toEqual({
      type: "component",
      from: "@theme/ui",
      import: "Hero",
      props: {
        tone: "primary",
      },
    });
  });

  it("normalizes runtime-created prop slots before crossing the boundary", async () => {
    await expect(
      normalizeCmxTree(
        jsx("main", {
          hero: jsx("span", { children: "Icon" }),
        }),
      ),
    ).resolves.toEqual({
      type: "element",
      tag: "main",
      props: {
        hero: {
          type: "element",
          tag: "span",
          children: ["Icon"],
        },
      },
      slots: [["hero"]],
    });
  });

  it("executes a hand-written prepared artifact", async () => {
    await expect(
      renderCmxTree({
        moduleUrl: new URL("./prepared-artifact.fixture.ts", import.meta.url),
      }),
    ).resolves.toEqual({
      type: "element",
      tag: "main",
      children: ["Hello"],
    });
  });
});
