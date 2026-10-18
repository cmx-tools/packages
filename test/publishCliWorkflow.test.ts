import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import {
  createCmxDocumentHost,
  createMemoryCmxDocumentStore,
} from "@cmx-tools/document-host";
import { createDocumentHostTestServer } from "./createDocumentHostTestServer.js";

const execFileAsync = promisify(execFile);

it("publishes an authoritative entry map through the umbrella CLI into a live host", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cmx-publish-workflow-"));
  const documents = {
    about: {
      $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
      cmxVersion: 1,
      interface: { imports: {}, exports: { default: {} } },
      content: { default: "About this site" },
    },
  };
  const host = createCmxDocumentHost({ store: createMemoryCmxDocumentStore() });
  const server = await createDocumentHostTestServer(host.handlePublication);

  try {
    await writeFile(
      path.join(directory, "documents.json"),
      JSON.stringify(documents),
    );
    const result = await execFileAsync(
      process.execPath,
      [
        fileURLToPath(
          new URL("../packages/cli/dist/cli/cli.js", import.meta.url),
        ),
        "publish",
        path.join(directory, "documents.json"),
        server.endpoint,
      ],
      { timeout: 10_000 },
    );

    expect(await host.getDocument("about")).toEqual(documents.about);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("sha256:");
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
