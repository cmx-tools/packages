import { beforeEach, describe, expect, test, vi } from "vitest";
import { collectTaskIssues } from "./collectIssues.js";
import { execFileOutput } from "./execFileOutput.js";

vi.mock("./execFileOutput.js", () => ({
  execFileOutput: vi.fn(),
}));

const parentUrl = "https://github.com/Xiphe/ralph/issues/37";

const execFileOutputMock = vi.mocked(execFileOutput);

describe("collectTaskIssues", () => {
  beforeEach(() => {
    execFileOutputMock.mockReset();
  });

  test("accepts parent heading with numeric issue ref", async () => {
    mockParentCrossRefs("## Parent\n\n#37");

    const text = await collectTaskIssues(parentUrl);

    expect(text).toContain("ISSUE #41");
    expect(text).toContain("## Child issue");
  });

  test("accepts exact parent issue link with loose marker", async () => {
    mockParentCrossRefs(`PARENT\n\n${parentUrl}`);

    const text = await collectTaskIssues(parentUrl);

    expect(text).toContain("ISSUE #41");
    expect(text).toContain("## Child issue");
  });

  test("rejects non-matching parent issue link", async () => {
    mockParentCrossRefs("Parent: https://github.com/Xiphe/other/issues/37");

    const text = await collectTaskIssues(parentUrl);

    expect(text).toBe("");
  });

  test("rejects numeric prefix matches", async () => {
    mockParentCrossRefs("Parent: #370");

    const text = await collectTaskIssues(parentUrl);

    expect(text).toBe("");
  });
});

function mockParentCrossRefs(childBody: string): void {
  execFileOutputMock.mockImplementation(async (_command, args) => {
    if (args[0] === "issue" && args[1] === "view") {
      return ok({
        number: 37,
        title: "Parent issue",
        url: parentUrl,
        state: "open",
        labels: [],
        body: null,
      });
    }

    if (args[0] === "api" && args[1] === "graphql") {
      return ok({
        data: {
          repository: {
            issue: {
              timelineItems: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    __typename: "CrossReferencedEvent",
                    referencedAt: "2026-04-27T00:00:00Z",
                    source: {
                      __typename: "Issue",
                      number: 41,
                      title: "Child issue",
                      url: "https://github.com/Xiphe/ralph/issues/41",
                      state: "OPEN",
                      body: childBody,
                      labels: { nodes: [{ name: "afk" }] },
                    },
                  },
                ],
              },
            },
          },
        },
      });
    }

    throw new Error(`unexpected gh args: ${args.join(" ")}`);
  });
}

function ok(stdoutJson: unknown): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  return {
    stdout: JSON.stringify(stdoutJson),
    stderr: "",
    exitCode: 0,
  };
}
