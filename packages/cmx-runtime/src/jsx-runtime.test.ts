import { describe, expect, it } from "vitest";
import {
  Fragment,
  __registerExternal,
  isRuntimeNode,
  jsx,
} from "cmx-runtime/jsx-runtime";

describe("cmx-runtime/jsx-runtime", () => {
  it("creates branded runtime nodes for elements, fragments, and external components", () => {
    const Hero = __registerExternal({
      from: "@theme/ui",
      import: "Hero",
    });

    const element = jsx("main", {
      id: "home",
      children: [
        jsx(Fragment, { children: "Intro" }),
        jsx(Hero, { tone: "primary" }),
      ],
    });

    expect(isRuntimeNode(element)).toBe(true);
    expect(element).toEqual({
      kind: "element",
      tag: "main",
      props: {
        id: "home",
      },
      children: [
        {
          kind: "fragment",
          children: ["Intro"],
        },
        {
          kind: "component",
          from: "@theme/ui",
          import: "Hero",
          props: {
            tone: "primary",
          },
        },
      ],
    });
  });
});
