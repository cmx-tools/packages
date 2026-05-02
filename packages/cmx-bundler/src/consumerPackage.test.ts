import { describe, expect, it } from "vitest";
import { findConsumerDependencySpecifier } from "./consumerPackage.js";

describe("findConsumerDependencySpecifier", () => {
  it("prefers dependencies over devDependencies", () => {
    expect(
      findConsumerDependencySpecifier(
        {
          dependencies: { foo: "^1.0.0" },
          devDependencies: { foo: "^2.0.0" },
        },
        "foo",
      ),
    ).toBe("^1.0.0");
  });

  it("falls through to peerDependencies then optionalDependencies", () => {
    expect(
      findConsumerDependencySpecifier(
        {
          peerDependencies: { bar: ">=3" },
          optionalDependencies: { bar: "^4" },
        },
        "bar",
      ),
    ).toBe(">=3");
  });

  it("returns undefined when absent", () => {
    expect(findConsumerDependencySpecifier({}, "missing")).toBeUndefined();
  });
});
