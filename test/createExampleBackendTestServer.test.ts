import { format } from "prettier";
import { describe, expect, it } from "vitest";
import { createExampleBackendTestServer } from "./createExampleBackendTestServer.js";

async function formatHtml(response: Response): Promise<string> {
  return format(await response.text(), { parser: "html" });
}

describe("createExampleBackendTestServer", () => {
  it("serves example fallback and about routes over HTTP", async () => {
    const server = await createExampleBackendTestServer();

    try {
      const fallback = await fetch(new URL("/", server.url));
      const about = await fetch(new URL("/about", server.url));

      expect(fallback.status).toBe(200);
      expect(fallback.headers.get("content-type")).toContain("text/html");
      expect(await formatHtml(fallback)).toMatchInlineSnapshot(`
        "<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>example</title>
          </head>
          <body>
            <h1>Not Found</h1>
          </body>
        </html>
        "
      `);

      expect(about.status).toBe(200);
      expect(about.headers.get("content-type")).toContain("text/html");
      expect(await formatHtml(about)).toMatchInlineSnapshot(`
        "<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>About</title>
          </head>
          <body>
            <div>
              <header class="beautiful-header">
                About<!-- -->
                <span class="header-accessory"><div>🧑‍🎤</div></span>
              </header>
              <p>About</p>
            </div>
          </body>
        </html>
        "
      `);
    } finally {
      await server.close();
    }
  }, 30_000);
});
