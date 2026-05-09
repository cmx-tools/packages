import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  collectPullRequestFixReferences,
  collectTaskIssues,
} from "./collectIssues.js";
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

describe("collectPullRequestFixReferences", () => {
  beforeEach(() => {
    execFileOutputMock.mockReset();
  });

  test("returns first PRD issue url and summary", async () => {
    const prUrl = "https://github.com/Xiphe/ralph/pull/19";
    const prdIssueUrl = "https://github.com/Xiphe/ralph/issues/77";
    execFileOutputMock.mockImplementation(async (_command, args) => {
      if (args[0] === "pr" && args[1] === "view") {
        return ok({
          number: 19,
          title: "Some feature",
          url: prUrl,
          body: `Implementation details\n\nfix: ${prdIssueUrl}\n`,
        });
      }

      if (args[0] === "issue" && args[1] === "view") {
        return ok({
          number: 77,
          title: "PRD: launch feature X",
          url: prdIssueUrl,
          state: "open",
          labels: [],
          body: "## PRD\n\nFeature goals...",
          comments: [{ body: "Looks good", author: { login: "xiphebrain" } }],
        });
      }

      throw new Error(`unexpected gh args: ${args.join(" ")}`);
    });

    const result = await collectPullRequestFixReferences(prUrl);

    expect(result.prdUrl).toBe(prdIssueUrl);
    expect(result.summary).toBe("Feature goals...");
  });

  test("returns empty result when no referenced issue is PRD", async () => {
    const prUrl = "https://github.com/Xiphe/ralph/pull/20";
    const issueUrl = "https://github.com/Xiphe/ralph/issues/78";
    execFileOutputMock.mockImplementation(async (_command, args) => {
      if (args[0] === "pr" && args[1] === "view") {
        return ok({
          number: 20,
          title: "Some fix",
          url: prUrl,
          body: "fix: #78",
        });
      }

      if (args[0] === "issue" && args[1] === "view") {
        return ok({
          number: 78,
          title: "Bug: edge case",
          url: issueUrl,
          state: "open",
          labels: [],
          body: "Fix edge case in parser",
          comments: [],
        });
      }

      throw new Error(`unexpected gh args: ${args.join(" ")}`);
    });

    const result = await collectPullRequestFixReferences(prUrl);

    expect(result.prdUrl).toBe("");
    expect(result.summary).toBe("");
  });

  test("accepts loose heading style fix marker", async () => {
    const prUrl = "https://github.com/Xiphe/ralph/pull/21";
    const issueUrl = "https://github.com/Xiphe/ralph/issues/79";
    execFileOutputMock.mockImplementation(async (_command, args) => {
      if (args[0] === "pr" && args[1] === "view") {
        return ok({
          number: 21,
          title: "Some fix",
          url: prUrl,
          body: `## Fix\n\n${issueUrl}`,
        });
      }

      if (args[0] === "issue" && args[1] === "view") {
        return ok({
          number: 79,
          title: "PRD rollout",
          url: issueUrl,
          state: "open",
          labels: [],
          body: "## PRD\n\nRollout details",
          comments: [],
        });
      }

      throw new Error(`unexpected gh args: ${args.join(" ")}`);
    });

    const result = await collectPullRequestFixReferences(prUrl);

    expect(result.prdUrl).toBe(issueUrl);
    expect(result.summary).toBe("Rollout details");
  });

  test("does not partial-match shorter issue numbers in fix marker", async () => {
    const prUrl = "https://github.com/Xiphe/ralph/pull/22";
    const issueUrl = "https://github.com/Xiphe/ralph/issues/790";
    execFileOutputMock.mockImplementation(async (_command, args) => {
      if (args[0] === "pr" && args[1] === "view") {
        return ok({
          number: 22,
          title: "Some fix",
          url: prUrl,
          body: "Fix: #790 Related: #79",
        });
      }

      if (args[0] === "issue" && args[1] === "view") {
        return ok({
          number: 790,
          title: "Bug: high number",
          url: issueUrl,
          state: "open",
          labels: [],
          body: "non prd",
          comments: [],
        });
      }

      throw new Error(`unexpected gh args: ${args.join(" ")}`);
    });

    const result = await collectPullRequestFixReferences(prUrl);

    expect(result.prdUrl).toBe("");
    expect(result.summary).toBe("");
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
