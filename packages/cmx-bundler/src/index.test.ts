import { expect, it } from "vitest";
import * as cmxBundler from "cmx-bundler";

it("does not expose standalone environment source generation", () => {
  expect("cmxGenerateEnvironmentSource" in cmxBundler).toBe(false);
});
