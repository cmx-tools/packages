# Drive AFK work

Reread this driver after compaction.

Act as orchestrator. Delegate implementation to subagents. Own scope, verification, CodeRabbit review, and PR readiness. The human merges PRs.

## Loop

1. **Select.** Check all open PRs first. Fix failing checks, resolve merge conflicts, and address review feedback before starting new work. Then read current issues, comments, and dependencies in the workstream. Pick unblocked, unclaimed `afk` work. Prioritize critical bugs, development infrastructure, tracer bullets, polish, then refactors. State the user-facing benefit and acceptance criteria before claiming the issue with `in_progress`.

2. **Delegate.** Use an isolated worktree on a `codex/` branch. Establish a green baseline with `corepack pnpm install --frozen-lockfile` and `corepack pnpm run verify`. Give each subagent fresh context with the issue, user benefit, acceptance criteria, relevant sources, and worktree ownership. Use `$tdd` for behavior changes. Scale decomposition and tests to the work.

3. **Verify and review.** Check the result against the acceptance criteria, format changed files, and run `corepack pnpm run verify`. Once green, run CodeRabbit CLI on the complete task diff. Wait for the review to finish, even when it takes 10 to 60 minutes. Treat findings as implementation input. Fix valid concerns, rerun verification, and repeat CodeRabbit review until no relevant findings remain. Missing access or a failed review blocks delivery.

4. **Deliver.** Use `$commit-afk`, push the branch, and open or update the PR. Replace `in_progress` with `in_review` and link the PR from the issue. Wait for required checks to pass and confirm the branch is mergeable. Return to verification and review after fixes. A task awaiting the human's merge stays open.

5. **Repeat.** Refresh the queue, including resolved HITL work. Keep all open PRs green and mergeable as the base branch and reviews change, even after implementation is finished. When every useful path is blocked, report the blockers and next action. Preserve work awaiting review. Continue until the scoped work is merged and no PR maintenance remains, or the human stops the session.

## Route blockers

When a missing decision, conflicting package responsibilities, or disproportionate complexity blocks implementation, stop that task and hand it to [HITL](HITL.md). Record the evidence and decision needed on the issue. Add `hitl` and `needs_feedback`; remove `afk` and your `in_progress` claim. Preserve useful work in its worktree and continue another task.

For external blockers, add `blocked externally`, release your claim, and record what must change before work can resume.
