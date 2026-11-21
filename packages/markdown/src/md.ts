import {
  Marked,
  Tokenizer,
  type Token,
  type Tokens,
  type MarkedToken,
} from "marked";
import { decodeHTMLStrict } from "entities/decode";
import {
  Fragment,
  jsx,
  __registerExternal,
  type RuntimeNode,
} from "@cmx-tools/runtime/jsx-runtime";

const markdown = new Marked({
  gfm: true,
  breaks: true,
  tokenizer: {
    html() {},
    tag() {},
    table() {},
    link(source) {
      const label = this.rules.inline.link.exec(source)?.[1];
      return Tokenizer.prototype.link.call(literalProps(this, label), source);
    },
    reflink(source, links) {
      const label = (this.rules.inline.reflink.exec(source) ??
        this.rules.inline.nolink.exec(source))?.[1];
      return Tokenizer.prototype.reflink.call(
        literalProps(this, label),
        source,
        links,
      );
    },
    def(source) {
      return Tokenizer.prototype.def.call(literalProps(this), source);
    },
    fences(source) {
      return Tokenizer.prototype.fences.call(literalProps(this), source);
    },
    del(source, maskedSource, previousCharacter) {
      if (source.startsWith("~~") && !source.startsWith("~~~"))
        return Tokenizer.prototype.del.call(
          this,
          source,
          maskedSource,
          previousCharacter,
        );
    },
    list(source) {
      const gfm = this.options.gfm;
      this.options.gfm = false;
      try {
        return Tokenizer.prototype.list.call(this, source);
      } finally {
        this.options.gfm = gfm;
      }
    },
  },
});

type TemplatePart = { text: string } | { interpolation: number };

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
  const staticParts = strings.flatMap((part) => [part, decodeMarkdown(part)]);
  while (staticParts.some((part) => part.includes(marker))) marker += "X";
  const slot = new RegExp(`${marker}(\\d+)\uE001`, "g");
  const source = strings
    .map(
      (part, index) =>
        part + (index < values.length ? `${marker}${index}\uE001` : ""),
    )
    .join("");
  const tokens = markdown.lexer(dedent(source));
  return jsx(Fragment, { children: tokens.flatMap(render) }) as RuntimeNode;

  function prop(value: string): unknown {
    const children = parts(value, (part) => [decodeMarkdown(part)]);
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
    return templateParts(value).flatMap((part) =>
      "text" in part ? literal(part.text) : [values[part.interpolation]],
    );
  }

  function templateParts(value: string): TemplatePart[] {
    const output: TemplatePart[] = [];
    let offset = 0;
    for (const match of value.matchAll(slot)) {
      if (match.index > offset)
        output.push({ text: value.slice(offset, match.index) });
      output.push({ interpolation: Number(match[1]) });
      offset = match.index + match[0].length;
    }
    if (offset < value.length) output.push({ text: value.slice(offset) });
    return output;
  }

  function render(token: Token): unknown {
    const node = token as MarkedToken;
    switch (node.type) {
      case "space":
      case "def":
        return [];
      case "text":
        return node.tokens
          ? node.tokens.flatMap(render)
          : parts(node.raw, (value) => [decodeMarkdown(value)]);
      case "escape":
        return parts(node.text);
      case "em":
      case "strong":
      case "del":
        return element(node.type, { children: node.tokens.flatMap(render) });
      case "link":
        return element("a", {
          href: node.autolink ? propertyLiteral(node.href) : prop(node.href),
          ...(node.title != null ? { title: prop(node.title) } : {}),
          children: node.autolink
            ? parts(node.text)
            : node.tokens.flatMap(render),
        });
      case "image":
        return element("img", {
          src: prop(node.href),
          alt: imageDescription(node.tokens),
          ...(node.title != null ? { title: prop(node.title) } : {}),
        });
      case "list":
        return element(node.ordered ? "ol" : "ul", {
          ...(node.ordered ? { start: node.start } : {}),
          children: node.items.map((item: Tokens.ListItem) =>
            element("li", { children: item.tokens.flatMap(render) }),
          ),
        });
      case "blockquote":
        return element("blockquote", { children: node.tokens.flatMap(render) });
      case "hr":
        return element("hr", {});
      case "br":
        return element("br", {});
      case "codespan":
        return element("code", { children: parts(node.text) });
      case "code":
        return element("pre", {
          children: element("code", {
            ...(node.lang
              ? { className: prop(`language-${node.lang.split(/\s/)[0]}`) }
              : {}),
            children: parts(node.text + (node.text ? "\n" : "")),
          }),
        });
      case "heading":
        return element(`h${node.depth}`, {
          children: node.tokens.flatMap(render),
        });
      case "paragraph": {
        const children = node.tokens.flatMap(render);
        if (node.text.replace(slot, "").trim() === "") return children;
        return element("p", { children });
      }
      default:
        return [];
    }
  }

  function propertyLiteral(value: string): unknown {
    const children = parts(value);
    return children.length === 1
      ? children[0]
      : children.length
        ? jsx(Fragment, { children })
        : "";
  }

  function imageDescription(tokens: Token[]): unknown {
    const combined: TemplatePart[] = [];
    for (const part of imageParts(tokens)) {
      const previous = combined.at(-1);
      if ("text" in part && previous && "text" in previous)
        previous.text += part.text;
      else combined.push(part);
    }
    const children = combined.map((part) =>
      "text" in part ? part.text : values[part.interpolation],
    );
    return children.length === 1
      ? children[0]
      : children.length
        ? jsx(Fragment, { children })
        : "";
  }

  function imageParts(tokens: Token[]): TemplatePart[] {
    return tokens.flatMap((token): TemplatePart[] => {
      if (token.type === "br") return [{ text: "\n" }];
      if (token.type === "text")
        return templateParts(token.raw).map((part) =>
          "text" in part ? { text: decodeMarkdown(part.text) } : part,
        );
      if (token.type === "link" && token.autolink)
        return templateParts(token.text);
      if ("tokens" in token && token.tokens) return imageParts(token.tokens);
      return "text" in token ? templateParts(token.text) : [];
    });
  }
}

function literalProps(tokenizer: Tokenizer, label?: string): Tokenizer {
  const context = new Tokenizer(tokenizer.options);
  context.lexer = tokenizer.lexer;
  if (label !== undefined) {
    const lexer = tokenizer.lexer;
    context.lexer = Object.create(lexer);
    context.lexer.inlineTokens = (_source, tokens) =>
      lexer.inlineTokens(label, tokens);
  }
  context.rules = {
    ...tokenizer.rules,
    inline: { ...tokenizer.rules.inline, anyPunctuation: /(?!)()/g },
  };
  return context;
}

function decodeMarkdown(value: string): string {
  return value.replace(
    /\\([\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e])|&(?:#[0-9]{1,7}|#[xX][0-9A-Fa-f]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/g,
    (match, escaped: string | undefined) => escaped ?? decodeHTMLStrict(match),
  );
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
