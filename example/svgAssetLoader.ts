import type { CmxAssetLoader } from "@cmx-tools/assets";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type SvgOptions = {
  previewWidth: number;
  directory: string;
  publicBaseUrl: string;
};

export const svgAssetLoader = {
  version: "3",
  extensions: [".svg"],
  options: {
    previewWidth: 12,
    directory: fileURLToPath(
      new URL("./content/.cmx/assets/files", import.meta.url),
    ),
    publicBaseUrl: "/_assets",
  },
  async load({ bytes, options }) {
    async function storeSvg(bytes: Uint8Array): Promise<string> {
      const key = `${createHash("sha256").update(bytes).digest("hex")}.svg`;
      await mkdir(options.directory, { recursive: true });
      try {
        await writeFile(path.join(options.directory, key), bytes, {
          flag: "wx",
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      return `${options.publicBaseUrl.replace(/\/$/u, "")}/${key}`;
    }
    const svg = new TextDecoder().decode(bytes);
    const root = svg.match(/<svg(?=\s|>)[^>]*>/u)?.[0];
    const width = Number(root?.match(/\swidth="(\d+)"/u)?.[1]);
    const height = Number(root?.match(/\sheight="(\d+)"/u)?.[1]);
    if (!root || !width || !height)
      throw new Error("SVG must declare width and height");
    const previewHeight = (height * options.previewWidth) / width;
    const previewRoot = root
      .replace(
        /(\swidth=")\d+"/u,
        (_attribute, prefix) => `${prefix}${options.previewWidth}"`,
      )
      .replace(
        /(\sheight=")\d+"/u,
        (_attribute, prefix) => `${prefix}${previewHeight}"`,
      );
    const preview = svg.replace(root, () => previewRoot);
    const src = await storeSvg(bytes);
    const previewUrl = await storeSvg(new TextEncoder().encode(preview));
    return {
      src,
      width,
      height,
      preview: previewUrl,
      srcset: `${previewUrl} ${options.previewWidth}w, ${src} ${width}w`,
    };
  },
} satisfies CmxAssetLoader<SvgOptions>;
