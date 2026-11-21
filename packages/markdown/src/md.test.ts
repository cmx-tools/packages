import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { compileCmxBundle } from "@cmx-tools/bundle";
import { renderCmxDocuments } from "@cmx-tools/document";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cmx, defaultCmxMarkdown } from "@cmx-tools/react";
import type { CmxDocument } from "@cmx-tools/contracts";

it("authors indented prose as sibling CMX blocks with visible source line breaks", async () => {
  const document = await renderMarkdown(`
    export default md\u0060
      # Hello

      This is prose.
      Another line.
    \u0060;
  `);
  expect(document.content.default).toEqual({
    type: "fragment",
    children: [
      { type: "element", tag: "h1", children: ["Hello"] },
      {
        type: "element",
        tag: "p",
        children: [
          "This is prose.",
          { type: "element", tag: "br" },
          "Another line.",
        ],
      },
    ],
  });
});

it("preserves JSX children and standalone blocks without interpreting interpolated strings", async () => {
  const document = await renderMarkdown(`
    const title = "**Literal**";
    const values = ["a", 2, false, null];
    export default md\u0060
      # \${title}

      Hello \${<span>World</span>} \${values}.

      \${<aside>Gallery</aside>}
    \u0060;
  `);
  expect(document.content.default).toEqual({
    type: "fragment",
    children: [
      { type: "element", tag: "h1", children: ["**Literal**"] },
      {
        type: "element",
        tag: "p",
        children: [
          "Hello ",
          { type: "element", tag: "span", children: ["World"] },
          " ",
          "a",
          2,
          false,
          null,
          ".",
        ],
      },
      { type: "element", tag: "aside", children: ["Gallery"] },
    ],
  });
});

it("formats an essay with emphasis, corrections, links and literal HTML", async () => {
  const document = await renderMarkdown(`export default md\u0060
    *Quiet* **loud** ~~revised~~ ~literal~.
    Visit https://example.com or [home](/home "Home").
    <div>**Still Markdown**</div>

    | table | syntax |
    | --- | --- |

    - [x] ordinary text

    Footnote[^1].

    [^1]: ordinary reference
  \u0060;`);
  expect(document.content.default).toMatchObject({
    type: "fragment",
    children: [
      {
        type: "element",
        tag: "p",
        children: [
          { type: "element", tag: "em", children: ["Quiet"] },
          " ",
          { type: "element", tag: "strong", children: ["loud"] },
          " ",
          { type: "element", tag: "del", children: ["revised"] },
          " ~literal~.",
          { type: "element", tag: "br" },
          "Visit ",
          {
            type: "element",
            tag: "a",
            props: { href: "https://example.com" },
            children: ["https://example.com"],
          },
          " or ",
          {
            type: "element",
            tag: "a",
            props: { href: "/home", title: "Home" },
            children: ["home"],
          },
          ".",
          { type: "element", tag: "br" },
          "<div>",
          { type: "element", tag: "strong", children: ["Still Markdown"] },
          "</div>",
        ],
      },
      {
        type: "element",
        tag: "p",
        children: [
          "| table | syntax |",
          { type: "element", tag: "br" },
          "| --- | --- |",
        ],
      },
      {
        type: "element",
        tag: "ul",
        children: [
          { type: "element", tag: "li", children: ["[x] ordinary text"] },
        ],
      },
      { type: "element", tag: "p", children: ["Footnote[^1]."] },
      { type: "element", tag: "p", children: ["[^1]: ordinary reference"] },
    ],
  });
});

it("uses dynamic links and images inside a JSX page without coercing attribute values", async () => {
  const document = await renderMarkdown(`
    const base = <span>Root</span>;
    const id = 42;
    const url = "https://example.com/a)b";
    export default function Page() {
      return <article>{md\u0060
        [\${<b>Profile</b>}](\${url} "\${<i>Title</i>}")
        [Mixed](\${base}/users/\${id})
        ![\${<em>Description</em>}](\${url} "Image \${id}")
        [Reference][guide] ![Cover][cover]

        [guide]: /guide "Guide"
        [cover]: /cover.png
      \u0060}</article>;
    }
  `);
  expect(document.content.default).toMatchObject({
    type: "element",
    tag: "article",
    children: [
      {
        type: "fragment",
        children: [
          {
            type: "element",
            tag: "p",
            children: [
              {
                type: "element",
                tag: "a",
                props: {
                  href: "https://example.com/a)b",
                  title: { type: "element", tag: "i", children: ["Title"] },
                },
                children: [
                  { type: "element", tag: "b", children: ["Profile"] },
                ],
              },
              { type: "element", tag: "br" },
              {
                type: "element",
                tag: "a",
                props: {
                  href: {
                    type: "fragment",
                    children: [
                      { type: "element", tag: "span", children: ["Root"] },
                      "/users/",
                      42,
                    ],
                  },
                },
                children: ["Mixed"],
              },
              { type: "element", tag: "br" },
              {
                type: "element",
                tag: "img",
                props: {
                  src: "https://example.com/a)b",
                  alt: {
                    type: "element",
                    tag: "em",
                    children: ["Description"],
                  },
                  title: { type: "fragment", children: ["Image ", 42] },
                },
              },
              { type: "element", tag: "br" },
              {
                type: "element",
                tag: "a",
                props: { href: "/guide", title: "Guide" },
                children: ["Reference"],
              },
              " ",
              {
                type: "element",
                tag: "img",
                props: { src: "/cover.png", alt: "Cover" },
              },
            ],
          },
        ],
      },
    ],
  });
});

it("writes a tutorial with nested steps, quotations and interpolated code", async () => {
  const document = await renderMarkdown(`
    const example = <mark>dynamic</mark>;
    export default md\u0060
      ## Tutorial

      > A quote.
      >
      > Another paragraph.

      3. Install
         - First
         - Second
      4. Run

      ~~~ts
      const value = \${example};
      next();
      ~~~

          indented
          code

      Use \\u0060inline \${example}\\u0060.

      ---
    \u0060;
  `);
  expect(document.content.default).toMatchObject({
    type: "fragment",
    children: [
      { type: "element", tag: "h2", children: ["Tutorial"] },
      {
        type: "element",
        tag: "blockquote",
        children: [
          { type: "element", tag: "p", children: ["A quote."] },
          { type: "element", tag: "p", children: ["Another paragraph."] },
        ],
      },
      {
        type: "element",
        tag: "ol",
        props: { start: 3 },
        children: [
          {
            type: "element",
            tag: "li",
            children: [
              "Install",
              {
                type: "element",
                tag: "ul",
                children: [
                  { type: "element", tag: "li", children: ["First"] },
                  { type: "element", tag: "li", children: ["Second"] },
                ],
              },
            ],
          },
          { type: "element", tag: "li", children: ["Run"] },
        ],
      },
      {
        type: "element",
        tag: "pre",
        children: [
          {
            type: "element",
            tag: "code",
            props: { className: "language-ts" },
            children: [
              "const value = ",
              { type: "element", tag: "mark", children: ["dynamic"] },
              ";\nnext();\n",
            ],
          },
        ],
      },
      {
        type: "element",
        tag: "pre",
        children: [
          { type: "element", tag: "code", children: ["indented\ncode\n"] },
        ],
      },
      {
        type: "element",
        tag: "p",
        children: [
          "Use ",
          {
            type: "element",
            tag: "code",
            children: [
              "inline ",
              { type: "element", tag: "mark", children: ["dynamic"] },
            ],
          },
          ".",
        ],
      },
      { type: "element", tag: "hr" },
    ],
  });
});

it("lets a host override headings while keeping default prose renderers and embedded components", async () => {
  const document = await renderMarkdown(`
    import {Aside} from "@my-app/prose";
    const prose = md({from:"@my-app/prose"});
    const base = <b>Root</b>;
    const id = 42;
    export default prose\u0060
      # Heading

      **Hello**, ~~old~~ [world](/world).
      ![Cover](/cover.png)
      [Profile](\${base}/users/\${id})

      \${<Aside>Embedded</Aside>}

      ~~~ts
      const x = 1;
      ~~~
    \u0060;
  `);
  function Heading({ children }: { children: ReactNode }) {
    return createElement("h1", { className: "custom" }, children);
  }
  function Link({ href, children }: { href: ReactNode; children: ReactNode }) {
    return createElement("span", {}, href, ":", children);
  }
  const hydrated = cmx(document, {
    dependencies: Object.values(document.interface.imports),
    imports: {
      "@my-app/prose": {
        ...defaultCmxMarkdown,
        h1: Heading,
        a: Link,
        Aside: "aside",
      },
    },
  });
  expect(document.interface.imports["@my-app/prose"]).toMatchObject({
    name: "@my-app/prose",
    version: "1.0.0",
  });
  expect(renderToStaticMarkup(hydrated.default as ReactNode)).toBe(
    '<link rel="preload" as="image" href="/cover.png"/><h1 class="custom">Heading</h1><p><strong>Hello</strong>, <del>old</del> <span>/world:world</span>.<br/><img src="/cover.png" alt="Cover"/><br/><span><b>Root</b>/users/42:Profile</span></p><aside>Embedded</aside><pre><code class="language-ts">const x = 1;\n</code></pre>',
  );
});

it("hydrates namespaced prose when the content has no component imports", async () => {
  const document = await renderMarkdown(`
    const prose = md({from:"@my-app/prose"});
    export default prose\u0060
      # A quiet afternoon

      Reading **together**.
    \u0060;
  `);
  const hydrated = cmx(document, {
    dependencies: Object.values(document.interface.imports),
    imports: { "@my-app/prose": { ...defaultCmxMarkdown } },
  });
  expect(document.interface.imports["@my-app/prose"]).toMatchObject({
    name: "@my-app/prose",
    specifier: "1.0.0",
    version: "1.0.0",
  });
  expect(renderToStaticMarkup(hydrated.default as ReactNode)).toBe(
    "<h1>A quiet afternoon</h1><p>Reading <strong>together</strong>.</p>",
  );
});

it("keeps paragraph spacing when a reading list includes notes and separate items", async () => {
  const document = await renderMarkdown(`export default md\u0060
    - First book

      A note about it.

    - Second book

    - Third book
  \u0060;`);
  expect(document.content.default).toEqual({
    type: "fragment",
    children: [
      {
        type: "element",
        tag: "ul",
        children: [
          {
            type: "element",
            tag: "li",
            children: [
              { type: "element", tag: "p", children: ["First book"] },
              { type: "element", tag: "p", children: ["A note about it."] },
            ],
          },
          {
            type: "element",
            tag: "li",
            children: [
              { type: "element", tag: "p", children: ["Second book"] },
            ],
          },
          {
            type: "element",
            tag: "li",
            children: [{ type: "element", tag: "p", children: ["Third book"] }],
          },
        ],
      },
    ],
  });
});

it("preserves dynamic code annotations and literal multiline values without marker leakage", async () => {
  const document = await renderMarkdown(`
    const language = <b>ts</b>;
    const value = "first\\n**second**";
    export default md\u0060
      Before \${value} after.

      ~~~\${language}
      \${value}
      ~~~
    \u0060;
  `);
  expect(document.content.default).toMatchObject({
    type: "fragment",
    children: [
      {
        type: "element",
        tag: "p",
        children: ["Before ", "first\n**second**", " after."],
      },
      {
        type: "element",
        tag: "pre",
        children: [
          {
            type: "element",
            tag: "code",
            props: {
              className: {
                type: "fragment",
                children: [
                  "language-",
                  { type: "element", tag: "b", children: ["ts"] },
                ],
              },
            },
            children: ["first\n**second**", "\n"],
          },
        ],
      },
    ],
  });
});

it("preserves relative code indentation in prose with CRLF and mixed tab indentation", async () => {
  const document = await renderMarkdown(
    "export default md`\\r\\n\\t# Heading\\r\\n\\r\\n    Paragraph\\r\\n\\r\\n        indented\\r\\n`;",
  );
  expect(document.content.default).toEqual({
    type: "fragment",
    children: [
      { type: "element", tag: "h1", children: ["Heading"] },
      { type: "element", tag: "p", children: ["Paragraph"] },
      {
        type: "element",
        tag: "pre",
        children: [{ type: "element", tag: "code", children: ["indented\n"] }],
      },
    ],
  });
});

it("keeps numeric character references literal beside interpolated prose", async () => {
  const document = await renderMarkdown(
    `export default md\u0060Character references: &#xE000;CMX0&#xE001;, then \${"value"}.\u0060;`,
  );
  expect(document.content.default).toEqual({
    type: "fragment",
    children: [
      {
        type: "element",
        tag: "p",
        children: [
          "Character references: \uE000CMX0\uE001, then ",
          "value",
          ".",
        ],
      },
    ],
  });
});

async function renderMarkdown(source: string): Promise<CmxDocument> {
  await mkdir(".cmx", { recursive: true });
  const root = await mkdtemp(path.resolve(".cmx/markdown-"));
  const bundleDir = path.join(root, "dist");
  try {
    await mkdir(path.join(root, "node_modules/@my-app/prose"), {
      recursive: true,
    });
    await writeFile(
      path.join(root, "node_modules/@my-app/prose/package.json"),
      JSON.stringify({
        name: "@my-app/prose",
        version: "1.0.0",
        type: "module",
        exports: "./index.js",
      }),
    );
    await writeFile(
      path.join(root, "node_modules/@my-app/prose/index.js"),
      "export const Aside = () => null;",
    );
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "markdown-content",
        type: "module",
        dependencies: { "@my-app/prose": "1.0.0" },
      }),
    );
    await writeFile(
      path.join(root, "entry.tsx"),
      `import {md} from "@cmx-tools/markdown";\n${source}`,
    );
    await compileCmxBundle({
      cwd: root,
      entries: { entry: path.join(root, "entry.tsx") },
      outDir: bundleDir,
      externals: ["@my-app/prose"],
      exports: {
        default: {
          required: true,
          type: { from: "@cmx-tools/contracts", import: "CmxNode" },
        },
      },
    });
    const result = await renderCmxDocuments({ bundleDir });
    if (result.result !== "complete") throw new Error(JSON.stringify(result));
    return JSON.parse(JSON.stringify(result.entries.entry.document));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
