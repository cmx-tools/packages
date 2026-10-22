import { defineCmxAssetProcessor } from "@cmx-tools/assets";

export const svgAssetProcessor = defineCmxAssetProcessor({
  version: "1",
  extensions: [".svg"],
  options: { previewWidth: 12 },
  process({ bytes, file, emit, options }) {
    const svg = new TextDecoder().decode(bytes);
    const width = Number(svg.match(/\bwidth="(\d+)"/u)?.[1]);
    const height = Number(svg.match(/\bheight="(\d+)"/u)?.[1]);
    if (!width || !height) throw new Error("SVG must declare width and height");
    const previewHeight = (height * options.previewWidth) / width;
    const preview = svg
      .replace(`width="${width}"`, `width="${options.previewWidth}"`)
      .replace(`height="${height}"`, `height="${previewHeight}"`);
    return {
      src: file(".svg"),
      width,
      height,
      preview: emit(new TextEncoder().encode(preview), ".svg"),
    };
  },
});
