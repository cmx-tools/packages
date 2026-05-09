// Sequential Reviewer — implement-then-review loop
//
// This template drives a two-phase workflow per issue:
//   Phase 1 (Implement): A sonnet agent picks an open GitHub issue, works on it
//                        on a dedicated branch, commits the changes, and signals
//                        completion.
//   Phase 2 (Review):    A second sonnet agent reviews the branch diff and either
//                        approves it or makes corrections directly on the branch.
//
// The outer loop repeats up to MAX_ITERATIONS times, processing one issue per
// iteration. This is a middle-complexity option between the simple-loop (no review
// gate) and the parallel-planner (concurrent execution with a planning phase).
//
// Usage:
//   npx tsx .sandcastle/main.ts
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.ts" }

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { collectBestNextTaskInput, collectIssueSnapshot } from "./collectTasks";

const args = process.argv.slice(2);
const issueLinkOrFolder = args[0];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Maximum number of implement→review cycles to run before stopping.
// Each cycle works on one issue. Raise this to process more issues per run.
const MAX_ITERATIONS = 20;
const REQUIRED_LABELS = ["afk"];
const EXCLUDED_LABELS = ["in_progress", "in_review"];

const mounts: sandcastle.MountConfig[] = [
  { hostPath: "~/.codex", sandboxPath: "~/.codex" },
  { hostPath: "~/.coderabbit", sandboxPath: "~/.coderabbit" },
];

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  const issueSnapshot = await collectIssueSnapshot([issueLinkOrFolder], {
    requiredLabels: REQUIRED_LABELS,
    excludedLabels: EXCLUDED_LABELS,
  });

  if (!issueSnapshot) {
    console.log("No more issues found.");
    break;
  }

  const plan = await sandcastle.run({
    sandbox: docker({ mounts }),
    name: "planner",
    promptArgs: {
      ISSUES_MD: issueSnapshot.text,
      WORKSTREAM_MD: issueSnapshot.inputTasks,
    },
    completionSignal: [
      "<promise>COMPLETE</promise>",
      "<promise>NO MORE TASKS</promise>",
    ],
    maxIterations: 1,
    agent: sandcastle.codex("gpt-5.4", { effort: "medium" }),
    promptFile: "./.sandcastle/pick-issue-prompt.md",
  });

  if (plan.completionSignal === "<promise>NO MORE TASKS</promise>") {
    console.log("No more tasks found.");
    break;
  }

  // Extract the <plan>…</plan> block from the agent's stdout.
  const planMatch = plan.stdout.match(/<plan>([\s\S]*?)<\/plan>/);
  if (!planMatch) {
    throw new Error("Have not found a valid next task.\n\n" + plan.stdout);
  }

  try {
    var { BEST_NEXT, UNBLOCKING, ANNOUNCEMENT } = JSON.parse(planMatch[1]);
  } catch (error) {
    console.error("Error parsing plan:", planMatch[1], error);
    process.exit(1);
  }

  const { task: fullNextTaskMd, url: bestNextTaskUrl } =
    await collectBestNextTaskInput(issueSnapshot, BEST_NEXT);

  // -------------------------------------------------------------------------
  // Phase 1: Implement
  // -------------------------------------------------------------------------
  console.log(
    `Implementing: ${bestNextTaskUrl}\n${fullNextTaskMd.split("\n")[0].replace(/^(# )+/, "")}`,
  );
  const implement = await sandcastle.run({
    hooks: {
      sandbox: {
        onSandboxReady: [
          {
            command: "CI=true pnpm install --config.confirmModulesPurge=false",
          },
        ],
      },
    },
    sandbox: docker({ mounts }),
    name: "implementer",
    agent: sandcastle.codex("gpt-5.3-codex"),
    promptFile: "./.sandcastle/implement-prompt.md",
    completionSignal: [
      "<promise>COMPLETE</promise>",
      "<promise>ABORT</promise>",
      "<promise>TASK_TAKEN</promise>",
    ],
    promptArgs: {
      WORKSTREAM_MD: issueSnapshot.inputTasks,
      TASK_MD: fullNextTaskMd,
      ANNOUNCEMENT_MD: String(ANNOUNCEMENT ?? "").trim(),
      FOLLOW_UPS_MD: Array.isArray(UNBLOCKING)
        ? UNBLOCKING.map(
            ({ id, title, summary }) =>
              `- **${title} (#${String(id).trim()})**\n  ${summary}`,
          ).join("\n")
        : "",
    },
  });

  if (implement.completionSignal === "<promise>ABORT<\/promise>") {
    const lines = implement.stdout.split(/\r?\n/);
    const lastLines = lines.slice(-20).join("\n");
    console.error(lastLines);
    throw new Error("Aborting implementation.");
  }

  if (implement.completionSignal === "<promise>TASK_TAKEN</promise>") {
    console.log("Task taken by someone else.");
    continue;
  }
}

console.log("\nAll done.");
