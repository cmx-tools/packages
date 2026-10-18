import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { createExampleBackendTestServer } from "./createExampleBackendTestServer.js";

const execFileAsync = promisify(execFile);

it("publishes content updates and removals into the running example and restores after restart", async () => {
  const directory = await copyExample();
  let server = await createExampleBackendTestServer({
    rootDir: directory,
  });
  try {
    expect((await fetch(new URL("/about", server.url))).status).toBe(404);
    await publish(directory, server.url);
    expect(await (await fetch(new URL("/about", server.url))).text()).toContain(
      "<title>About</title>",
    );

    await writeFile(
      path.join(directory, "example/content/pages/about.tsx"),
      'import type { Meta } from "@example/backend-contract"; export const meta: Meta = { title: "Updated live" }; export default <p>Published without restarting</p>;',
    );
    await writeFile(
      path.join(directory, "example/content/pages/news.tsx"),
      "export default <p>Latest news</p>;",
    );
    await publish(directory, server.url);
    expect(await (await fetch(new URL("/about", server.url))).text()).toContain(
      "<title>Updated live</title>",
    );
    expect(await (await fetch(new URL("/news", server.url))).text()).toContain(
      "Latest news",
    );
    await rm(path.join(directory, "example/content/pages/news.tsx"));
    await publish(directory, server.url);
    expect((await fetch(new URL("/news", server.url))).status).toBe(404);

    await server.close();
    server = await createExampleBackendTestServer({
      rootDir: directory,
    });
    expect((await fetch(new URL("/about", server.url))).status).toBe(404);
    await publish(directory, server.url);
    expect(await (await fetch(new URL("/about", server.url))).text()).toContain(
      "Published without restarting",
    );
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);

it("keeps accepted content when a later build is partial or the host rejects unsafe content", async () => {
  const directory = await copyExample();
  const server = await createExampleBackendTestServer({
    rootDir: directory,
  });
  try {
    await publish(directory, server.url);
    await writeFile(
      path.join(directory, "example/content/pages/about.tsx"),
      "export default <p>This must not replace the accepted page</p>;",
    );
    await writeFile(
      path.join(directory, "example/content/pages/broken.tsx"),
      'export default function Broken() { throw new Error("Cannot render this page"); }',
    );
    await expect(publish(directory, server.url)).rejects.toThrow(
      "Cannot render this page",
    );
    expect(await (await fetch(new URL("/about", server.url))).text()).toContain(
      "<title>About</title>",
    );

    await rm(path.join(directory, "example/content/pages/broken.tsx"));
    await writeFile(
      path.join(directory, "example/content/pages/unsafe.tsx"),
      'export default <script>alert("untrusted")</script>;',
    );
    await expect(publish(directory, server.url)).rejects.toThrow(
      "ugc-disallowed-element",
    );
    expect(await (await fetch(new URL("/about", server.url))).text()).toContain(
      "<title>About</title>",
    );
    expect((await fetch(new URL("/unsafe", server.url))).status).toBe(404);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);

it("renders published entry names through encoded browser URLs", async () => {
  const directory = await copyExample();
  const server = await createExampleBackendTestServer({
    rootDir: directory,
  });
  try {
    await writeFile(
      path.join(directory, "example/content/pages/café.tsx"),
      "export default <p>Unicode entry</p>;",
    );
    await publish(directory, server.url);
    expect(
      await (await fetch(new URL("/caf%C3%A9", server.url))).text(),
    ).toContain("Unicode entry");
    expect((await fetch(new URL("/bad%escape", server.url))).status).toBe(400);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);

async function copyExample(): Promise<string> {
  await mkdir(path.resolve(".cmx"), { recursive: true });
  const directory = await mkdtemp(path.resolve(".cmx/example-publication-"));
  await cp("example", path.join(directory, "example"), {
    recursive: true,
    filter: (source) => path.basename(source) !== "node_modules",
  });
  await cp("package.json", path.join(directory, "package.json"));
  await symlink(
    path.resolve("packages"),
    path.join(directory, "packages"),
    "dir",
  );
  await symlink(
    path.resolve("node_modules"),
    path.join(directory, "node_modules"),
    "dir",
  );
  for (const name of ["backend", "content", "backend-contract", "ui-library"]) {
    await symlink(
      path.resolve("example", name, "node_modules"),
      path.join(directory, "example", name, "node_modules"),
      "dir",
    );
  }
  return directory;
}

async function publish(directory: string, serverUrl: URL): Promise<void> {
  await execFileAsync("corepack", ["pnpm", "run", "example:publish"], {
    cwd: directory,
    env: {
      ...process.env,
      CMX_PUBLISH_ENDPOINT: new URL("/_cmx/publication", serverUrl).href,
    },
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}
