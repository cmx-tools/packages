import { describe, expect, it } from "vitest";
import { glob } from "./glob.js";

describe("glob", () => {
  it("resolves matches relative to cwd", async () => {
    const matches = await glob("src/*.ts", {
      cwd: new URL(".", import.meta.url).pathname,
      importModule: async () => ({
        default: async () => ["src/a.ts"],
      }),
    });

    expect(matches).toEqual(["src/a.ts"]);
  });

  it("prints install hint when fast-glob is missing", async () => {
    await expect(
      glob("*.ts", {
        cwd: process.cwd(),
        importModule: async () => {
          const error = new Error("missing") as Error & { code: string };
          error.code = "ERR_MODULE_NOT_FOUND";
          throw error;
        },
      }),
    ).rejects.toThrow(
      'Missing CLI dependency "fast-glob". Install with: pnpm add -D fast-glob',
    );
  });
});
