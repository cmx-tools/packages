import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export async function createDocumentHostTestServer(
  handlePublication: (request: Request) => Promise<Response>,
): Promise<{ endpoint: string; close(): Promise<void> }> {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        for (const item of Array.isArray(value) ? value : [value]) {
          if (item !== undefined) headers.append(name, item);
        }
      }
      const request = new Request(
        `http://${incoming.headers.host}${incoming.url}`,
        {
          method: incoming.method,
          headers,
          body:
            chunks.length === 0
              ? undefined
              : Buffer.concat(chunks).toString("utf8"),
        },
      );
      const response = await handlePublication(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    } catch {
      outgoing.writeHead(500).end("Test server failed");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    endpoint: `http://127.0.0.1:${port}/cmx`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
