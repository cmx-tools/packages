import { describe, expect, it } from "vitest";
import { createExampleBackendTestServer } from "./createExampleBackendTestServer.js";

describe("createExampleBackendTestServer", () => {
  it("serves example fallback and about routes over HTTP", async () => {
    const server = await createExampleBackendTestServer();

    try {
      const fallback = await fetch(new URL("/", server.url));
      const about = await fetch(new URL("/about", server.url));

      expect(fallback.status).toBe(500);
      expect(fallback.headers.get("content-type")).toContain("text/html");
      expect(await fallback.text()).toContain(
        "renderCmxReact is a contract stub",
      );

      expect(about.status).toBe(500);
      expect(about.headers.get("content-type")).toContain("text/html");
      expect(await about.text()).toContain("renderCmxReact is a contract stub");
    } finally {
      await server.close();
    }
  }, 30_000);
});
