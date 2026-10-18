import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/cli/cli.js", import.meta.url));
const emptyContentHash =
  "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a";

describe("cmx-publish", () => {
  it("publishes a complete entry map received on stdin", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(304).end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const { port } = server.address() as AddressInfo;
      const publication = exec(process.execPath, [
        binary,
        "-",
        `http://127.0.0.1:${port}/cmx`,
      ]);
      publication.child.stdin!.end("{}");
      const result = await publication;
      expect(JSON.parse(result.stdout)).toEqual({
        contentHash: emptyContentHash,
      });
      expect(result.stderr).toBe("");
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    }
  });

  it("publishes an authoritative JSON file from an independent process", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cmx-publish-cli-"));
    const requests: unknown[] = [];
    const server = createServer((request, response) => {
      requests.push({
        method: request.method,
        hash: request.headers["if-none-match"],
      });
      response.writeHead(304).end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      await writeFile(path.join(directory, "documents.json"), "{}");
      const { port } = server.address() as AddressInfo;
      const result = await exec(
        process.execPath,
        [binary, "documents.json", `http://127.0.0.1:${port}/cmx`],
        { cwd: directory },
      );
      expect(JSON.parse(result.stdout)).toEqual({
        contentHash: emptyContentHash,
      });
      expect(result.stderr).toBe("");
      expect(requests).toEqual([
        { method: "GET", hash: `"${emptyContentHash}"` },
      ]);
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    { label: "malformed JSON", input: "{" },
    { label: "empty input", input: "" },
  ])(
    "rejects $label on stdin without contacting the host",
    async ({ input }) => {
      const requests: string[] = [];
      const server = createServer((request, response) => {
        requests.push(request.method!);
        response.writeHead(304).end();
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      try {
        const { port } = server.address() as AddressInfo;
        const publication = exec(process.execPath, [
          binary,
          "-",
          `http://127.0.0.1:${port}/cmx`,
        ]);
        publication.child.stdin!.end(input);
        await expect(publication).rejects.toMatchObject({
          code: 1,
          stdout: "",
          stderr: expect.stringContaining("Invalid JSON in stdin"),
        });
        expect(requests).toEqual([]);
      } finally {
        server.closeAllConnections();
        server.close();
        await once(server, "close");
      }
    },
  );

  it("reports the connection failure when the document host is unavailable", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "cmx-publish-unavailable-"),
    );
    const server = createServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    const closed = once(server, "close");
    server.close();
    await closed;
    try {
      await writeFile(path.join(directory, "documents.json"), "{}");
      await expect(
        exec(
          process.execPath,
          [binary, "documents.json", `http://127.0.0.1:${port}/cmx`],
          { cwd: directory },
        ),
      ).rejects.toMatchObject({
        code: 1,
        stdout: "",
        stderr: expect.stringContaining("ECONNREFUSED"),
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("documents command usage and reports its installed package version", async () => {
    const help = await exec(process.execPath, [binary, "--help"]);
    expect(help.stdout).toContain("cmx-publish <documents.json> <endpoint>");
    expect(help.stdout).toContain("cmx-publish - <endpoint>");
    expect(help.stderr).toBe("");
    const version = await exec(process.execPath, [binary, "--version"]);
    const manifest = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    expect(version.stdout).toBe(`${manifest.version}\n`);
    expect(version.stderr).toBe("");
  });

  it.each([
    {
      label: "malformed JSON",
      input: "{",
      expected: "Invalid JSON in documents.json",
    },
    {
      label: "an array instead of an entry map",
      input: "[]",
      expected: "JSON entry map",
    },
    {
      label: "a single Document instead of an entry map",
      input: '{"$schema":"schema","content":{}}',
      expected: "JSON entry map",
    },
  ])(
    "rejects $label before contacting an endpoint",
    async ({ input, expected }) => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), "cmx-publish-input-"),
      );
      try {
        await writeFile(path.join(directory, "documents.json"), input);
        await expect(
          exec(
            process.execPath,
            [binary, "documents.json", "http://127.0.0.1:1/cmx"],
            { cwd: directory },
          ),
        ).rejects.toMatchObject({
          code: 1,
          stdout: "",
          stderr: expect.stringContaining(expected),
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it("reports rejected Documents with their entry names and diagnostic codes", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "cmx-publish-rejection-"),
    );
    const server = createServer((_request, response) => {
      response.writeHead(422, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          message: "Documents rejected",
          diagnostics: {
            about: [
              {
                severity: "error",
                code: "blocked-export",
                message: "Export is not permitted",
              },
            ],
          },
        }),
      );
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      await writeFile(path.join(directory, "documents.json"), "{}");
      const { port } = server.address() as AddressInfo;
      await expect(
        exec(
          process.execPath,
          [binary, "documents.json", `http://127.0.0.1:${port}/cmx`],
          { cwd: directory },
        ),
      ).rejects.toMatchObject({
        code: 1,
        stdout: "",
        stderr:
          "Documents rejected\nabout: blocked-export: Export is not permitted\n",
      });
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
      await rm(directory, { recursive: true, force: true });
    }
  });
});
