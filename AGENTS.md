GitHub: `cmx-tools/packages`
Commit Messages Format: Conventional Commits
Package manager: pnpm
Skills in: `~/.agents/skills` or `./.agents/skills`

Read MISSION.md
Read CONTEXT.md for CMX domain glossary and package boundaries.

NEVER write docs or code-comments for intermediate or iterative steps
ANY docs/comments MUST cut to the point. NO fluff. AVOID parentheses

NEVER parametrize interfaces for eventual future use.
NEVER maintain backwards compatibility in internal or unreleased API
refactoring code cheap – maintaining interfaces expensive.

ALWAYS single responsibility files. Multi exports ok. But clear domain
COLOCATE tests with implementation
file name === main export name
File structure:

```
{imports}
{constants/config}
{types/contracts}
{exports/api}
{internal/impl}
```

FOLDERS are internal modules with index as API
NEVER folders with only one implementation file
(tests, index and other barrels are not implementation files).
NEVER deep imports from internal modules
ALWAYS feature/deep-module based architecture. Small interface, lots of implementation
AVOID functional folders (`components` or `hooks`)

ALWAYS and ONLY test through official module/package/folder APIs.
NEVER cement internal interfaces or implementation details using tests.
EVERY test must be be a unique real world use-case of a first class call-site.

## Commits

- Plan commit boundaries by independently reviewable and revertible behavior, not by issue or completed worktree. Separate independent contract, build, verification, and adapter changes even within one issue.
- Keep each commit buildable and include its relevant tests and usage documentation. Group cross-package edits when one coherent behavior or contract requires them together.
- Prefer a few clearly scoped commits. Give each commit a Conventional Commit scope matching its complete behavior or subsystem.
- Before committing, compare the entire staged diff with the title and body. Account for affected public contracts and release impact, including consumer and CLI changes.

## Driver sessions

Use [HITL](drivers/HITL.md) for human decisions and [AFK](drivers/AFK.md) for delivery.

Labels: `afk`, `hitl`, `needs grilling`, `needs_feedback`, `in_progress`, `in_review`, `blocked externally`.
