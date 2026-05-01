import { expect, expectTypeOf, it } from "vitest";
import type { CmxEnvironment, CmxEnvironmentEntry } from "cmx-bundle";
import {
  cmxGenerateEnvironmentSource,
  type CmxGenerateEnvironmentSourceInput,
} from "cmx-bundler";
import { renderCmxReact, type RenderCmxReactResult } from "cmx-react";

it("exposes the shallow environment source generation contract", () => {
  const input: CmxGenerateEnvironmentSourceInput = {
    entries: [{ from: "./api.js", as: "@example/backend-contract" }],
    metaType: { from: "@example/backend-contract", import: "Meta" },
  };

  const result = cmxGenerateEnvironmentSource(input);

  expect(typeof result.source).toBe("string");
  expect(result.source).toContain("type CmxEnvironment");
  expect(result.source).toContain('"@example/backend-contract": {}');
  expectTypeOf<CmxEnvironmentEntry>().toEqualTypeOf<{
    from: string;
    as?: string;
  }>();
  expectTypeOf<CmxEnvironment<{ title: string }>>().toMatchTypeOf<{
    dependencies: unknown[];
    imports: Record<string, Record<string, unknown>>;
    metaType?: { from: string; import?: string };
  }>();
});

it("exposes the shallow React rendering contract", () => {
  expect(renderCmxReact).toEqual(expect.any(Function));
  expectTypeOf<RenderCmxReactResult<{ title: string }>["meta"]>().toEqualTypeOf<
    { title: string } | undefined
  >();
});
