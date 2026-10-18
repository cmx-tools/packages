import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { documentHost } from "./documentHost.js";

export async function handlePublicationRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : Readable.toWeb(req);
  const request = new Request(url, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: body as ReadableStream<Uint8Array> | undefined,
    ...(body === undefined ? {} : { duplex: "half" }),
  });
  const response = await documentHost.handlePublication(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}
