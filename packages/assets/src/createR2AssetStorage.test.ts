import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createCmxAssetPipeline,
  createLocalAssetStorage,
  createR2AssetStorage,
  type CmxAssetsConfig,
} from "@cmx-tools/assets";

const hello = {
  key: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824.txt",
  bytes: new TextEncoder().encode("hello"),
};
const helloEtag = '"5d41402abc4b2a76b9719d911017c592"';

describe("R2 Asset Storage", () => {
  it("switches cached preprocessing from local disk to R2 without processing again", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "cmx-r2-assets-"));
    try {
      const source = '<svg width="40" height="20"/>';
      const thumbnail = '<svg width="10" height="5"/>';
      await writeFile(path.join(cwd, "photo.svg"), source);
      const localDirectory = path.join(cwd, "public");
      const localBaseUrl = pathToFileURL(`${localDirectory}/`).href;
      let processing = 0;
      const assets: CmxAssetsConfig = {
        cacheDir: ".cmx/cache",
        processors: {
          image: {
            version: "1",
            extensions: [".svg"],
            process(input) {
              processing++;
              return {
                src: input.file(".svg"),
                width: 40,
                thumbnail: input.emit(Buffer.from(thumbnail), ".svg"),
              };
            },
          },
        },
        storage: createLocalAssetStorage({
          directory: localDirectory,
          publicBaseUrl: localBaseUrl,
        }),
      };
      const development = (await createCmxAssetPipeline({ cwd, assets }).load(
        "photo.svg",
      )) as { src: string; width: number; thumbnail: string };
      expect(await readFile(new URL(development.src), "utf8")).toBe(source);
      expect(await readFile(new URL(development.thumbnail), "utf8")).toBe(
        thumbnail,
      );
      const uploaded: string[] = [];
      await withEndpoint(
        async (request, response) => {
          if (request.method === "HEAD") {
            response.writeHead(404).end();
            return;
          }
          expect(request.headers["content-type"]).toBe("image/svg+xml");
          const chunks: Buffer[] = [];
          for await (const chunk of request) chunks.push(chunk);
          uploaded.push(Buffer.concat(chunks).toString());
          response.writeHead(200).end();
        },
        async (endpoint) => {
          const production = createCmxAssetPipeline({
            cwd,
            assets: { ...assets, storage: r2(endpoint) },
          });
          await expect(production.load("photo.svg")).resolves.toEqual({
            src: development.src.replace(
              localBaseUrl,
              "https://cdn.example.test/media/",
            ),
            width: 40,
            thumbnail: development.thumbnail.replace(
              localBaseUrl,
              "https://cdn.example.test/media/",
            ),
          });
          expect(processing).toBe(1);
          expect(uploaded.sort()).toEqual([source, thumbnail].sort());
        },
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("uploads an Asset through the authenticated S3 API and resolves its public URL", async () => {
    await withEndpoint(
      async (request, response) => {
        expect(request.url?.split("?")[0]).toBe(`/assets/${hello.key}`);
        expect(request.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
        if (request.method === "HEAD") {
          response.writeHead(404).end();
          return;
        }
        expect(request.method).toBe("PUT");
        expect(request.headers["content-type"]).toBe("text/plain");
        expect(request.headers["content-md5"]).toBe("XUFAKrxLKna5cZ2REBfFkg==");
        expect(request.headers["if-none-match"]).toBe("*");
        expect(request.headers["cache-control"]).toBe(
          "public,max-age=31536000,immutable",
        );
        expect(request.headers["x-amz-sdk-checksum-algorithm"]).toBeUndefined();
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(chunk);
        expect(Buffer.concat(chunks).toString()).toBe("hello");
        response.writeHead(200, { ETag: helloEtag }).end();
      },
      async (endpoint) => {
        const storage = r2(endpoint);
        await expect(storage.store(hello)).resolves.toBe(
          `https://cdn.example.test/media/${hello.key}`,
        );
      },
    );
  });

  it("reuses a stored output across separate builds without uploading it again", async () => {
    let uploaded = false;
    let uploads = 0;
    await withEndpoint(
      async (request, response) => {
        if (request.method === "HEAD") {
          response
            .writeHead(
              uploaded ? 200 : 404,
              uploaded ? { ETag: helloEtag, "Content-Length": "5" } : {},
            )
            .end();
          return;
        }
        for await (const _chunk of request) {
        }
        uploaded = true;
        uploads++;
        response.writeHead(200, { ETag: helloEtag }).end();
      },
      async (endpoint) => {
        const originalUrl = await r2(endpoint).store(hello);
        await expect(r2(endpoint).store(hello)).resolves.toBe(originalUrl);
        expect(uploads).toBe(1);
      },
    );
  });

  it("refuses a final URL when the stored output has different content", async () => {
    await withEndpoint(
      (request, response) => {
        expect(request.method).toBe("HEAD");
        response
          .writeHead(200, {
            ETag: '"00000000000000000000000000000000"',
            "Content-Length": "5",
          })
          .end();
      },
      async (endpoint) => {
        await expect(r2(endpoint).store(hello)).rejects.toThrow(/integrity/i);
      },
    );
  });

  it("lets concurrent builds share the output committed by either build", async () => {
    let uploaded = false;
    let uploads = 0;
    const initialReads: ServerResponse[] = [];
    await withEndpoint(
      async (request, response) => {
        if (request.method === "HEAD") {
          if (uploaded) {
            response
              .writeHead(200, { ETag: helloEtag, "Content-Length": "5" })
              .end();
          } else {
            initialReads.push(response);
            if (initialReads.length === 2) {
              initialReads.forEach((pending) => pending.writeHead(404).end());
            }
          }
          return;
        }
        expect(request.headers["if-none-match"]).toBe("*");
        for await (const _chunk of request) {
        }
        if (uploaded) {
          response
            .writeHead(412, { "Content-Type": "application/xml" })
            .end("<Error><Code>PreconditionFailed</Code></Error>");
          return;
        }
        uploaded = true;
        uploads++;
        response.writeHead(200, { ETag: helloEtag }).end();
      },
      async (endpoint) => {
        await expect(
          Promise.all([r2(endpoint).store(hello), r2(endpoint).store(hello)]),
        ).resolves.toEqual([
          `https://cdn.example.test/media/${hello.key}`,
          `https://cdn.example.test/media/${hello.key}`,
        ]);
        expect(uploads).toBe(1);
      },
    );
  });

  it("publishes an image with browser-readable content metadata", async () => {
    const image = {
      key: "ffc9f5e4fdeea83920c171e2bd17577127c5d1a2c3c76f07440e10d387132280.svg",
      bytes: new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
      ),
    };
    await withEndpoint(
      async (request, response) => {
        if (request.method === "HEAD") {
          response.writeHead(404).end();
          return;
        }
        expect(request.headers["content-type"]).toBe("image/svg+xml");
        for await (const _chunk of request) {
        }
        response.writeHead(200).end();
      },
      async (endpoint) => {
        await expect(r2(endpoint).store(image)).resolves.toBe(
          `https://cdn.example.test/media/${image.key}`,
        );
      },
    );
  });

  it("stores an unrecognized processor output as binary content", async () => {
    await withEndpoint(
      async (request, response) => {
        if (request.method === "HEAD") {
          response.writeHead(404).end();
          return;
        }
        expect(request.headers["content-type"]).toBe(
          "application/octet-stream",
        );
        for await (const _chunk of request) {
        }
        response.writeHead(200).end();
      },
      async (endpoint) => {
        const key = hello.key.replace(/\.txt$/, ".palette");
        await expect(
          r2(endpoint).store({ key, bytes: hello.bytes }),
        ).resolves.toBe(`https://cdn.example.test/media/${key}`);
      },
    );
  });

  it.each(["HEAD", "PUT"])(
    "rejects storage when R2 denies the %s operation",
    async (deniedOperation) => {
      await withEndpoint(
        async (request, response) => {
          if (request.method === "HEAD" && deniedOperation === "PUT") {
            response.writeHead(404).end();
            return;
          }
          expect(request.method).toBe(deniedOperation);
          for await (const _chunk of request) {
          }
          response
            .writeHead(403, { "Content-Type": "application/xml" })
            .end("<Error><Code>AccessDenied</Code></Error>");
        },
        async (endpoint) => {
          await expect(r2(endpoint).store(hello)).rejects.toMatchObject({
            $metadata: { httpStatusCode: 403 },
          });
        },
      );
    },
  );
});

function r2(endpoint: string) {
  return createR2AssetStorage({
    endpoint,
    bucket: "assets",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    publicBaseUrl: "https://cdn.example.test/media/",
  });
}

async function withEndpoint(
  handle: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void | Promise<void>,
  run: (endpoint: string) => Promise<void>,
): Promise<void> {
  const failures: unknown[] = [];
  const server = createServer((request, response) => {
    Promise.resolve()
      .then(() => handle(request, response))
      .catch((error) => {
        failures.push(error);
        response.writeHead(400).end();
      });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
    expect(failures).toEqual([]);
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
}
