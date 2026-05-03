import { describe, expect, it } from "vitest";
import { createExampleBackendTestServer } from "./createExampleBackendTestServer.js";

describe("createExampleBackendTestServer", () => {
  it("serves example fallback and about routes over HTTP", async () => {
    const server = await createExampleBackendTestServer();

    try {
      const fallback = await fetch(new URL("/", server.url));
      const about = await fetch(new URL("/about", server.url));

      expect(fallback.status).toBe(200);
      expect(fallback.headers.get("content-type")).toContain("text/html");
      expect(await fallback.text()).toContain("<h1>Not Found</h1>");

      expect(about.status).toBe(200);
      expect(about.headers.get("content-type")).toContain("text/html");
      const aboutHtml = await about.text();
      expect(aboutHtml).toContain("<title>About</title>");
      expect(aboutHtml).toContain("beautiful-header");
      expect(aboutHtml).toContain("header-accessory");
      expect(aboutHtml).toContain("<p>About</p>");
      expect(aboutHtml).toContain("🧑‍🎤");
    } finally {
      await server.close();
    }
  }, 30_000);
});
