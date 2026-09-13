import parse from "css-tree/parser";
import type { DeclarationList } from "css-tree";

export function parseCmxStyle(css: string): Record<string, string> {
  const declarations = parse(css, {
    context: "declarationList",
    parseValue: false,
  }) as DeclarationList;
  const style = new Map<string, string>();

  for (const declaration of declarations.children) {
    if (
      declaration.type !== "Declaration" ||
      declaration.value.type !== "Raw"
    ) {
      continue;
    }
    const name = declaration.property.startsWith("--")
      ? declaration.property
      : declaration.property
          .toLowerCase()
          .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
          .replace(/^Ms/, "ms");
    const value = declaration.property.startsWith("--")
      ? declaration.value.value
      : declaration.value.value.trim();
    const priority =
      declaration.important === true ? "important" : declaration.important;
    style.delete(name);
    style.set(name, priority ? `${value.trimEnd()} !${priority}` : value);
  }

  return Object.fromEntries(style);
}
