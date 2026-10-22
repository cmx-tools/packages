import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { format } from "prettier";
import { describe, expect, it } from "vitest";
import { createExampleBackendTestServer } from "./createExampleBackendTestServer.js";

const execFileAsync = promisify(execFile);

async function formatHtml(response: Response): Promise<string> {
  return format(await response.text(), { parser: "html" });
}

describe("createExampleBackendTestServer", () => {
  it("renders export-map page output for fallback and about routes", async () => {
    const server = await createExampleBackendTestServer();

    try {
      expect((await fetch(new URL("/about", server.url))).status).toBe(404);
      const state = await fetch(new URL("/_cmx/publication", server.url));
      expect(state.status).toBe(200);
      expect(await state.json()).toMatchObject({ manifest: {} });
      await execFileAsync("corepack", ["pnpm", "run", "example:publish"], {
        env: {
          ...process.env,
          CMX_PUBLISH_ENDPOINT: new URL("/_cmx/publication", server.url).href,
        },
        timeout: 30_000,
      });
      const fallback = await fetch(new URL("/", server.url));
      const about = await fetch(new URL("/about", server.url));

      expect(fallback.status).toBe(200);
      expect(fallback.headers.get("content-type")).toContain("text/html");
      const fallbackHtml = await formatHtml(fallback);
      expect(fallbackHtml).toContain("<title>example</title>");
      expect(fallbackHtml).toContain("<h1>Not Found</h1>");

      expect(about.status).toBe(200);
      expect(about.headers.get("content-type")).toContain("text/html");
      const aboutHtml = await formatHtml(about);
      expect(aboutHtml).toContain("<title>About</title>");
      expect(aboutHtml).toContain(
        '<span class="header-accessory"><div>🧑‍🎤</div></span>',
      );
      expect(aboutHtml).toContain("<p>About</p>");

      expect(fallbackHtml).toMatchInlineSnapshot(`
        "<!DOCTYPE html>
        <html lang=\"en\">
          <head>
            <meta charset=\"utf-8\" />
            <title>example</title>
          </head>
          <body>
            <h1>Not Found</h1>
          </body>
        </html>
        "
      `);

      expect(aboutHtml).toMatchInlineSnapshot(`
        "<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <link
              rel="preload"
              as="image"
              imagesrcset="/_assets/bdc5d95bfb0dcda57c928bcc64a82f4afea6dd0177fb322dbce23fc7c87fdb31.svg 12w, /_assets/c5ff722bda9782ae33c23d4bc16ab6832e0056e10cf93ad0df593d1805850c79.svg 24w"
            />
            <title>About</title>
          </head>
          <body>
            <div>🧑‍🎤</div>
            <div>
              <header class="beautiful-header">
                About<!-- -->
                <span class="header-accessory"><div>🧑‍🎤</div></span>
              </header>
              <p>About</p>
              <img
                alt="Portrait"
                height="16"
                src="/_assets/bdc5d95bfb0dcda57c928bcc64a82f4afea6dd0177fb322dbce23fc7c87fdb31.svg"
                srcset="
                  /_assets/bdc5d95bfb0dcda57c928bcc64a82f4afea6dd0177fb322dbce23fc7c87fdb31.svg 12w,
                  /_assets/c5ff722bda9782ae33c23d4bc16ab6832e0056e10cf93ad0df593d1805850c79.svg 24w
                "
                width="24"
              />
            </div>
          </body>
        </html>
        "
      `);
    } finally {
      await server.close();
    }
  }, 120_000);
});
