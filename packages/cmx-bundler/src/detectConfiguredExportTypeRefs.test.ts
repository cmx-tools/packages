import { describe, expect, it } from "vitest";
import { detectConfiguredExportTypeRefs } from "./detectConfiguredExportTypeRefs.js";

const configuredExports = {
  default: {
    required: true,
    type: {
      from: "cmx-contracts",
      import: "CmxNode",
    },
  },
  meta: {
    required: false,
    type: {
      from: "@example/backend-contract",
      import: "PageMeta",
    },
  },
  teaser: {
    required: false,
    type: {
      from: "@example/backend-contract",
      import: "Teaser",
    },
  },
} as const;

describe("detectConfiguredExportTypeRefs", () => {
  it("detects value annotation, function return type, satisfies, and type alias", () => {
    const source = [
      'import type { PageMeta, Teaser as TeaserContract } from "@example/backend-contract";',
      "type LocalMeta = PageMeta;",
      'const teaserValue = { heading: "Hello" } satisfies TeaserContract;',
      "export const teaser = teaserValue;",
      'export const meta: LocalMeta = { title: "Hello" };',
      "export default function Page(): LocalMeta {",
      '  return { title: "Default" };',
      "}",
    ].join("\n");

    expect(
      detectConfiguredExportTypeRefs({
        source,
        id: "entry.tsx",
        exports: configuredExports,
      }),
    ).toEqual({
      default: {
        from: "@example/backend-contract",
        import: "PageMeta",
      },
      meta: {
        from: "@example/backend-contract",
        import: "PageMeta",
      },
      teaser: {
        from: "@example/backend-contract",
        import: "Teaser",
      },
    });
  });

  it("treats generic, structural, composed, and local-only types as unknown", () => {
    const source = [
      "type LocalOnly = { title: string };",
      'import type { Teaser } from "@example/backend-contract";',
      "type Composed = Teaser & { draft: boolean };",
      'export const meta: LocalOnly = { title: "Hello" };',
      'export const teaser = (() : Composed => ({ heading: "Hello", draft: true }))();',
      'export default ({ title: "Default" } satisfies LocalOnly);',
    ].join("\n");

    expect(
      detectConfiguredExportTypeRefs({
        source,
        id: "entry.tsx",
        exports: configuredExports,
      }),
    ).toEqual({
      default: undefined,
      meta: undefined,
      teaser: undefined,
    });
  });

  it("detects default type imports and handles namespace import specifiers", () => {
    const source = [
      'import type DefaultMeta from "@example/backend-contract";',
      'import type * as ContractTypes from "@example/backend-contract";',
      "type LocalMeta = DefaultMeta;",
      "type Namespaced = ContractTypes.PageMeta;",
      'export const meta: LocalMeta = { title: "Hello" };',
      'export const teaser: Namespaced = { heading: "Hello" };',
    ].join("\n");

    expect(
      detectConfiguredExportTypeRefs({
        source,
        id: "entry.tsx",
        exports: configuredExports,
      }),
    ).toEqual({
      meta: {
        from: "@example/backend-contract",
      },
      teaser: undefined,
    });
  });
});
