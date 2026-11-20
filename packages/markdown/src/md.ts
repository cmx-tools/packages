import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmAutolinkLiteralFromMarkdown } from "mdast-util-gfm-autolink-literal";
import { gfmStrikethroughFromMarkdown } from "mdast-util-gfm-strikethrough";
import { gfmAutolinkLiteral } from "micromark-extension-gfm-autolink-literal";
import { gfmStrikethrough } from "micromark-extension-gfm-strikethrough";
import { decodeString } from "micromark-util-decode-string";
import type { Definition, Nodes } from "mdast";
import {
  Fragment,
  jsx,
  __registerExternal,
  type RuntimeNode,
} from "@cmx-tools/runtime/jsx-runtime";

export type MarkdownOptions = { from: string };
export type MarkdownTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => RuntimeNode;

export function md(
  strings: TemplateStringsArray,
  ...values: unknown[]
): RuntimeNode;
export function md(options: MarkdownOptions): MarkdownTag;
export function md(
  input: TemplateStringsArray | MarkdownOptions,
  ...values: unknown[]
): RuntimeNode | MarkdownTag {
  if ("from" in input)
    return (strings, ...values) => renderMarkdown(strings, values, input.from);
  return renderMarkdown(input, values);
}

function renderMarkdown(
  strings: TemplateStringsArray,
  values: unknown[],
  from?: string,
): RuntimeNode {
  function element(tag: string, props: Record<string, unknown>): unknown {
    return jsx(
      from !== undefined ? __registerExternal({ from, import: tag }) : tag,
      props,
    );
  }
  let marker = "\uE000CMX";
  const staticParts = strings.flatMap((part) => [part, decodeString(part)]);
  while (staticParts.some((part) => part.includes(marker))) marker += "X";
  const slot = new RegExp(`${marker}(\\d+)\uE001`, "g");
  const source = strings
    .map(
      (part, index) =>
        part + (index < values.length ? `${marker}${index}\uE001` : ""),
    )
    .join("");
  const tree = fromMarkdown(dedent(source), {
    extensions: [
      { disable: { null: ["htmlFlow", "htmlText"] } },
      gfmAutolinkLiteral(),
      gfmStrikethrough({ singleTilde: false }),
    ],
    mdastExtensions: [
      gfmAutolinkLiteralFromMarkdown(),
      gfmStrikethroughFromMarkdown(),
    ],
  });
  const definitions = new Map<string, Definition>();
  collectDefinitions(tree);
  return jsx(Fragment, {
    children: tree.children.flatMap(render),
  }) as RuntimeNode;

  function collectDefinitions(node: Nodes): void {
    if (node.type === "definition" && !definitions.has(node.identifier))
      definitions.set(node.identifier, node);
    if ("children" in node) node.children.forEach(collectDefinitions);
  }

  function prop(value: string): unknown {
    const children = parts(value);
    return children.length === 1
      ? children[0]
      : children.length
        ? jsx(Fragment, { children })
        : "";
  }

  function parts(
    value: string,
    literal: (value: string) => unknown[] = (value) => [value],
  ): unknown[] {
    const output: unknown[] = [];
    let offset = 0;
    for (const match of value.matchAll(slot)) {
      if (match.index > offset)
        output.push(...literal(value.slice(offset, match.index)));
      output.push(values[Number(match[1])]);
      offset = match.index + match[0].length;
    }
    if (offset < value.length) output.push(...literal(value.slice(offset)));
    return output;
  }

  function render(node: Nodes): unknown {
    if (node.type === "text")
      return parts(node.value, (value) =>
        value
          .split("\n")
          .flatMap((line, index) => [
            ...(index ? [element("br", {})] : []),
            ...(line ? [line] : []),
          ]),
      );
    if (
      node.type === "emphasis" ||
      node.type === "strong" ||
      node.type === "delete"
    )
      return element(
        node.type === "emphasis"
          ? "em"
          : node.type === "delete"
            ? "del"
            : "strong",
        { children: node.children.flatMap(render) },
      );
    if (node.type === "definition") return [];
    if (
      node.type === "link" ||
      node.type === "image" ||
      node.type === "linkReference" ||
      node.type === "imageReference"
    ) {
      const reference =
        node.type === "linkReference" || node.type === "imageReference"
          ? definitions.get(node.identifier)!
          : node;
      const title =
        reference.title != null ? { title: prop(reference.title) } : {};
      return node.type === "image" || node.type === "imageReference"
        ? element("img", {
            src: prop(reference.url),
            alt: prop(node.alt ?? ""),
            ...title,
          })
        : element("a", {
            href: prop(reference.url),
            ...title,
            children: node.children.flatMap(render),
          });
    }
    if (node.type === "list")
      return element(node.ordered ? "ol" : "ul", {
        ...(node.ordered && node.start !== null ? { start: node.start } : {}),
        children: node.children.map((item) =>
          element("li", {
            children: item.children.flatMap((child) =>
              child.type === "paragraph" && !node.spread && !item.spread
                ? child.children.flatMap(render)
                : [render(child)],
            ),
          }),
        ),
      });
    if (node.type === "blockquote")
      return element("blockquote", { children: node.children.flatMap(render) });
    if (node.type === "thematicBreak") return element("hr", {});
    if (node.type === "break") return element("br", {});
    if (node.type === "inlineCode")
      return element("code", { children: parts(node.value) });
    if (node.type === "code")
      return element("pre", {
        children: element("code", {
          ...(node.lang ? { className: prop(`language-${node.lang}`) } : {}),
          children: parts(node.value + (node.value ? "\n" : "")),
        }),
      });

    if (node.type === "heading" || node.type === "paragraph") {
      const children = node.children.flatMap(render);
      if (
        node.type === "paragraph" &&
        node.children.every(
          (child) =>
            child.type === "text" &&
            child.value.replace(slot, "").trim() === "",
        )
      )
        return children;
      return element(node.type === "heading" ? `h${node.depth}` : "p", {
        children,
      });
    }
    return null;
  }
}

function dedent(source: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indentation = Math.min(
    ...lines
      .filter((line) => line.trim())
      .map((line) => {
        let column = 0;
        for (const character of line.match(/^[\t ]*/)![0])
          column += character === "\t" ? 4 - (column % 4) : 1;
        return column;
      }),
  );
  return lines
    .map((line) => {
      let column = 0;
      let index = 0;
      while (
        index < line.length &&
        column < indentation &&
        /[\t ]/.test(line[index])
      ) {
        column += line[index++] === "\t" ? 4 - (column % 4) : 1;
      }
      return " ".repeat(Math.max(0, column - indentation)) + line.slice(index);
    })
    .join("\n");
}
