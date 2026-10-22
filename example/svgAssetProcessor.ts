import type { CmxAssetProcessor } from "@cmx-tools/assets";
import { fileURLToPath } from "node:url";
import { storeSvg } from "./storeSvg.js";

type SvgOptions = {
  previewWidth: number;
  directory: string;
  publicBaseUrl: string;
};

export const svgAssetProcessor = {
  version: "2",
  extensions: [".svg"],
  options: {
    previewWidth: 12,
    directory: fileURLToPath(
      new URL("./content/.cmx/assets/files", import.meta.url),
    ),
    publicBaseUrl: "/_assets",
  },
  async process({ bytes, options }) {
    const svg = new TextDecoder().decode(bytes);
    const width = Number(svg.match(/\bwidth="(\d+)"/u)?.[1]);
    const height = Number(svg.match(/\bheight="(\d+)"/u)?.[1]);
    if (!width || !height) throw new Error("SVG must declare width and height");
    const previewHeight = (height * options.previewWidth) / width;
    const preview = svg
      .replace(`width="${width}"`, `width="${options.previewWidth}"`)
      .replace(`height="${height}"`, `height="${previewHeight}"`);
    const src = await storeSvg(bytes, options.directory, options.publicBaseUrl);
    const previewUrl = await storeSvg(
      new TextEncoder().encode(preview),
      options.directory,
      options.publicBaseUrl,
    );
    return {
      src,
      width,
      height,
      preview: previewUrl,
      srcset: `${previewUrl} ${options.previewWidth}w, ${src} ${width}w`,
    };
  },
} satisfies CmxAssetProcessor<SvgOptions>;
