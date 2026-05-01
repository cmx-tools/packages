Read MISSION.md
Read CONTEXT.md for CMX domain glossary and package boundaries.

Github Repo is `Xiphe/content-management-jsx`
DO use conventional commit message format
ONLY commit when instructed

NEVER write docs or code-comments for intermediate or iterative steps
ANY docs/comments MUST cut to the point. NO fluff. AVOID parentheses

NEVER parametrize interfaces for eventual future use.
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
NEVER folders with less then 3 implementation files
NEVER deep imports from internal modules
ALWAYS feature/deep-module based architecture. Small interface, lots of implementation
AVOID functional folders (`components` or `hooks`)
