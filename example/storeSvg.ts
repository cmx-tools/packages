import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function storeSvg(
  bytes: Uint8Array,
  directory: string,
  publicBaseUrl: string,
): Promise<string> {
  const key = `${createHash("sha256").update(bytes).digest("hex")}.svg`;
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(path.join(directory, key), bytes, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return `${publicBaseUrl.replace(/\/$/u, "")}/${key}`;
}
