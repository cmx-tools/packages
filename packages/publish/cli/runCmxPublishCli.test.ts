import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  it("publishes through a configured authenticated transport with relative input and custom config", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "cmx-publish-auth-"),
    );
    const project = path.join(directory, "content");
    const requests: Array<{
      method: string;
      authorization: string | undefined;
    }> = [];
    const server = createServer(async (request, response) => {
      requests.push({
        method: request.method!,
        authorization: request.headers.authorization,
      });
      if (request.headers.authorization !== "Bearer local-publish-token") {
        response.writeHead(401).end();
        return;
      }
      if (request.method === "GET") {
        response
          .writeHead(200, {
            "Content-Type": "application/json",
            ETag: `"${emptyContentHash}"`,
          })
          .end(JSON.stringify({ contentHash: emptyContentHash, manifest: {} }));
        return;
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const delta = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify({ contentHash: delta.targetContentHash }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      await mkdir(project);
      await writeFile(
        path.join(project, ".env"),
        "CMX_CLI_TEST_TOKEN=local-publish-token\n",
      );
      await writeFile(
        path.join(project, "authenticated.config.ts"),
        `
        const token = process.env.CMX_CLI_TEST_TOKEN;
        export default {
          publish: {
            fetch(input, init) {
              const headers = new Headers(init.headers);
              headers.set("Authorization", "Bearer " + token);
              return fetch(input, { ...init, headers });
            },
          },
        };
      `,
      );
      await writeFile(
        path.join(project, "documents.json"),
        JSON.stringify({
          about: {
            $schema:
              "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
            cmxVersion: 1,
            interface: { imports: {}, exports: { default: {} } },
            content: { default: "About this site" },
          },
        }),
      );
      const { port } = server.address() as AddressInfo;
      const result = await exec(
        process.execPath,
        [
          binary,
          "documents.json",
          `http://127.0.0.1:${port}/cmx`,
          "--cwd",
          project,
          "--config",
          "authenticated.config.ts",
        ],
        { cwd: directory },
      );
      expect(JSON.parse(result.stdout).contentHash).toMatch(/^sha256:/);
      expect(result.stderr).toBe("");
      expect(requests).toEqual([
        { method: "GET", authorization: "Bearer local-publish-token" },
        { method: "PUT", authorization: "Bearer local-publish-token" },
      ]);
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    { status: 401, rejectedMethod: "GET", expectedMethods: ["GET"] },
    { status: 403, rejectedMethod: "PUT", expectedMethods: ["GET", "PUT"] },
  ])(
    "reports HTTP $status from an authenticated endpoint",
    async ({ status, rejectedMethod, expectedMethods }) => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), "cmx-publish-denied-"),
      );
      const methods: string[] = [];
      const server = createServer((request, response) => {
        methods.push(request.method!);
        if (request.method === rejectedMethod) {
          response.writeHead(status).end();
          return;
        }
        response
          .writeHead(200, {
            "Content-Type": "application/json",
            ETag: `"${emptyContentHash}"`,
          })
          .end(JSON.stringify({ contentHash: emptyContentHash, manifest: {} }));
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      try {
        await writeFile(path.join(directory, "documents.json"), "{}");
        await writeFile(
          path.join(directory, "cmx.config.ts"),
          `
        export default {
          publish: {
            fetch(input, init) {
              const headers = new Headers(init.headers);
              headers.set("Authorization", "Bearer rejected-token");
              return fetch(input, { ...init, headers });
            },
          },
        };
      `,
        );
        const { port } = server.address() as AddressInfo;
        await expect(
          exec(
            process.execPath,
            [binary, "documents.json", `http://127.0.0.1:${port}/cmx`],
            {
              cwd: directory,
            },
          ),
        ).rejects.toMatchObject({
          code: 1,
          stdout: "",
          stderr: expect.stringContaining(
            `Document host responded with HTTP ${status}.`,
          ),
        });
        expect(methods).toEqual(expectedMethods);
      } finally {
        server.closeAllConnections();
        server.close();
        await once(server, "close");
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it("rejects a configured transport that is not a function before contacting the host", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "cmx-publish-invalid-config-"),
    );
    const requests: string[] = [];
    const server = createServer((request, response) => {
      requests.push(request.method!);
      response.writeHead(304).end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      await writeFile(path.join(directory, "documents.json"), "{}");
      await writeFile(
        path.join(directory, "cmx.config.ts"),
        'export default { publish: { fetch: "not a function" } };',
      );
      const { port } = server.address() as AddressInfo;
      await expect(
        exec(
          process.execPath,
          [binary, "documents.json", `http://127.0.0.1:${port}/cmx`],
          {
            cwd: directory,
          },
        ),
      ).rejects.toMatchObject({
        code: 1,
        stdout: "",
        stderr: "CMX config publish.fetch must be a function.\n",
      });
      expect(requests).toEqual([]);
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not evaluate project configuration for help or version", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "cmx-publish-help-"),
    );
    try {
      await writeFile(
        path.join(directory, "cmx.config.ts"),
        'throw new Error("Configuration must not execute");',
      );
      const help = await exec(process.execPath, [binary, "--help"], {
        cwd: directory,
      });
      expect(help.stdout).toContain("--cwd <path>");
      expect(help.stdout).toContain("--config <path>");
      expect(help.stderr).toBe("");
      const version = await exec(process.execPath, [binary, "--version"], {
        cwd: directory,
      });
      expect(version.stdout).toMatch(/^\d+\.\d+\.\d+/);
      expect(version.stderr).toBe("");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    {
      args: ["documents.json", "http://127.0.0.1:1/cmx", "--cwd"],
      expected: "--cwd requires a value",
    },
    {
      args: [
        "--config",
        "--cwd",
        "/tmp",
        "documents.json",
        "http://127.0.0.1:1/cmx",
      ],
      expected: "--config requires a value",
    },
    {
      args: ["documents.json", "http://127.0.0.1:1/cmx", "--unknown"],
      expected: "Unknown option: --unknown",
    },
  ])("rejects invalid CLI arguments: $expected", async ({ args, expected }) => {
    await expect(
      exec(process.execPath, [binary, ...args]),
    ).rejects.toMatchObject({
      code: 1,
      stdout: "",
      stderr: `${expected}\n`,
    });
  });

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
