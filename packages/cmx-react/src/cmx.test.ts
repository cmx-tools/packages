import { Fragment, isValidElement } from "react";
import { describe, expect, it } from "vitest";
import type { CmxDocument } from "cmx-contracts";
import { cmx } from "cmx-react";

describe("cmx", () => {
  it.each([null, true, false, 7, "text"])(
    "materializes primitive node %s",
    (tree) => {
      expect(cmx(createDocument({ tree })).children).toBe(tree);
    },
  );

  it("materializes a pure CMX document into React values", () => {
    const document = createDocument({
      meta: {
        data: {
          title: "Fallback",
        },
      },
      tree: {
        type: "fragment",
        children: [
          "prefix",
          {
            type: "element",
            tag: "h1",
            props: {
              className: "title",
            },
            children: ["Not Found"],
          },
        ],
      },
    });

    const result = cmx(document);

    expect(result.meta).toEqual({
      title: "Fallback",
    });
    expect(isValidElement(result.children)).toBe(true);
    if (!isValidElement(result.children)) {
      throw new Error("CMX fragment did not materialize to a React element");
    }

    expect(result.children.type).toBe(Fragment);
    const fragmentChildren = result.children.props.children;
    expect(fragmentChildren[0]).toBe("prefix");
    expect(isValidElement(fragmentChildren[1])).toBe(true);
    expect(fragmentChildren[1].type).toBe("h1");
    expect(fragmentChildren[1].props).toEqual({
      className: "title",
      children: "Not Found",
    });
  });
});

function createDocument(document: Partial<CmxDocument> = {}): CmxDocument {
  return {
    $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
    cmxVersion: 1,
    dependencies: [],
    tree: null,
    ...document,
  };
}
