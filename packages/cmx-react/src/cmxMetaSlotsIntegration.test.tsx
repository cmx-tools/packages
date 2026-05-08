/** @jsxImportSource react */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CmxDocument, CmxEnvironment } from "cmx-contracts";
import { cmx } from "cmx-react";

describe("cmx React export slots", () => {
  it("hydrates slots for default and named exports", () => {
    function Badge() {
      return <span className="badge">Featured</span>;
    }
    const document: CmxDocument = {
      $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
      cmxVersion: 1,
      interface: {
        imports: {
          "@site/theme": {
            name: "@site/theme",
            specifier: "^1.0.0",
            version: "1.2.3",
          },
        },
        exports: {
          default: {
            type: {
              from: "cmx-contracts",
              import: "CmxNode",
            },
            slots: [[]],
          },
          meta: {
            slots: [["badge"]],
          },
        },
      },
      content: {
        default: {
          type: "element",
          tag: "main",
          children: [
            {
              type: "component",
              from: "@site/theme",
              import: "Badge",
            },
            "About",
          ],
        },
        meta: {
          title: "About",
          badge: {
            type: "component",
            from: "@site/theme",
            import: "Badge",
          },
        },
      },
    };
    const environment: CmxEnvironment = {
      dependencies: Object.values(document.interface.imports),
      imports: {
        "@site/theme": {
          Badge,
        },
      },
    };

    const page = cmx(document, environment);
    const html = renderToString(
      <App title={(page.meta as { title: string }).title}>
        {page.default}
        {(page.meta as { badge: React.ReactNode }).badge}
      </App>,
    );

    expect(html).toContain('<span class="badge">Featured</span>');
    expect(html).toContain("<main");
    expect(html).toContain("About");
    expect(html).toContain("<title>About</title>");
  });
});

function App({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <title>{title}</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
