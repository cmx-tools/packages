import { normalizeCmxBooleanAttribute } from "./normalizeCmxBooleanAttribute.js";
import { parseCmxStyle } from "./parseCmxStyle.js";
import { reactAttributeNames } from "./reactAttributeNames.js";

const HYPHENATED_STANDARD_ELEMENTS = new Set([
  "annotation-xml",
  "color-profile",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "font-face-name",
  "missing-glyph",
]);

export function mapCmxIntrinsicProps(
  tag: string,
  props: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!props) {
    return props;
  }

  const customElement =
    tag.includes("-") && !HYPHENATED_STANDARD_ELEMENTS.has(tag);
  return Object.fromEntries(
    Object.entries(props).map(([name, value]) => {
      if (name === "style" && typeof value === "string") {
        return [name, parseCmxStyle(value)];
      }
      if (name === "innerHTML" && typeof value === "string") {
        return ["dangerouslySetInnerHTML", { __html: value }];
      }
      if (customElement) {
        return [name, value];
      }
      return [
        Object.hasOwn(reactAttributeNames, name)
          ? reactAttributeNames[name]
          : name,
        normalizeCmxBooleanAttribute(tag, name, value),
      ];
    }),
  );
}
