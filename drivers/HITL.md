# Resolve human input

Reread this driver after compaction.

Work with the human through one issue at a time. Own decisions and human actions; hand implementation to [AFK](AFK.md).

## Loop

1. **Select.** Pick a scoped issue labeled `hitl`, `needs grilling`, or `needs_feedback`. Read its comments, linked decisions, and affected code. Introduce the issue link, user benefit, and decision or action needed with enough context that the human need not read the ticket.

2. **Resolve.** Find facts in project evidence and primary sources. Use `$grilling` to stress-test unresolved decisions, presenting concrete tradeoffs and a recommendation. Use `$wizard` for actions only the human can perform. Proceed when the human agrees on behavior, scope, and acceptance criteria, or the required action has a verified result. Reopen settled answers only when new evidence conflicts with them.

3. **Record.** Write the agreed outcome and rationale to the issue. Update repository guidance only for enduring changes to architecture, terminology, or instructions. Keep each decision in one authoritative place and link to it. Show repository changes for human review.

4. **Hand off.** When the remaining work is executable, add `afk`, remove `hitl`, `needs grilling`, and `needs_feedback`, and release your claim. Leave delivery issues open. Give AFK the acceptance criteria and any existing branch or worktree. Keep unresolved decisions in HITL and external dependencies labeled `blocked externally`, with the next action recorded.

5. **Repeat.** Select the next useful HITL issue. When none remain, report that and wait for the human.
