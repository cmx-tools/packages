/** @jsxImportSource react */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CmxDocument, CmxEnvironment } from "cmx-contracts";
import { cmx } from "cmx-react";

type PageMeta = {
  title: string;
  badge: React.ReactNode;
};

describe("cmx React meta slots", () => {
  it("renders materialized meta slots at the app boundary", () => {
    function Badge() {
      return <span className="badge">Featured</span>;
    }
    const document: CmxDocument = {
      $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
      cmxVersion: 1,
      dependencies: [
        {
          name: "@site/theme",
          specifier: "^1.0.0",
          version: "1.2.3",
        },
      ],
      meta: {
        data: {
          title: "About",
          badge: {
            type: "component",
            from: "@site/theme",
            import: "Badge",
          },
        },
        slots: [["badge"]],
      },
      tree: {
        type: "element",
        tag: "main",
        children: ["About"],
      },
    };
    const environment: CmxEnvironment<PageMeta> = {
      dependencies: document.dependencies,
      imports: {
        "@site/theme": {
          Badge,
        },
      },
    };

    const { children, meta } = cmx<PageMeta>(document, environment);
    const html = renderToString(<App children={children} meta={meta} />);

    expect(html).toContain("<title>About</title>");
    expect(html).toContain('<span class="badge">Featured</span>');
    expect(html).toContain("<main>About</main>");
  });
});

function App({
  children,
  meta,
}: {
  children: React.ReactNode;
  meta?: PageMeta;
}) {
  return (
    <html lang="en">
      <head>
        <title>{meta?.title}</title>
      </head>
      <body>
        {meta?.badge}
        {children}
      </body>
    </html>
  );
}
