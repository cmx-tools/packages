/** @jsxImportSource react */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CmxDocument, CmxEnvironment } from "cmx-contracts";
import { cmx } from "cmx-react";

describe("cmx React default export slots", () => {
  it("renders hydrated default export slots at the app boundary", () => {
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

    const { children } = cmx(document, environment);
    const html = renderToString(<App>{children}</App>);

    expect(html).toContain('<span class="badge">Featured</span>');
    expect(html).toContain("<main");
    expect(html).toContain("About");
  });
});

function App({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
