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

      expect(about.status).toBe(500);
      expect(about.headers.get("content-type")).toContain("text/html");
      expect(await about.text()).toContain(
        "CMX component nodes are not supported yet.",
      );
    } finally {
      await server.close();
    }
  }, 30_000);
});
