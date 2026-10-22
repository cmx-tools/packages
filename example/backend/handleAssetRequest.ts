import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";

export async function handleAssetRequest(
  pathname: string,
  response: ServerResponse,
): Promise<void> {
  const key = pathname.match(/^\/_assets\/([a-f0-9]{64}\.svg)$/u)?.[1];
  if (!key) {
    response.writeHead(404);
    response.end();
    return;
  }
  try {
    const bytes = await readFile(
      new URL(`../content/.cmx/assets/files/${key}`, import.meta.url),
    );
    response.writeHead(200, {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(bytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    response.writeHead(404);
    response.end();
  }
}
