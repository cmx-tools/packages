# Your content is JSX

We believe that working with JSX is simpler and more rewarding than dealing with any existing CMS user interface.

---

Most CMS products take a simple problem and turn it into four systems: editor, schema, database, renderer. Each layer invents its own rules. Each handoff weakens the contract. Each abstraction makes the site harder to understand, harder to change, and harder to trust.

**We reject that model.**

A website does not need a CMS schema. It needs structure and re-usability. That is JSX.  
People need agency and control over what exactly happens on their site. That means no opaque systems in between.
The source of truth must be the thing people and agents can both read, edit, review, version, preview, and ship without translation. That is code in Git.

Our job is to make this model operationally effortless:

- Git as the database.
- TypeScript as the contract.
- JSX as the content model.
- Packages as themes.
- Branches as previews.
- The platform as the safe, hosted runtime.

## North Star

**Your content is JSX.**

## Mission

Build a code-first CMS for the agent era by making Git, TypeScript, and JSX the native model for content, while the platform absorbs the operational burden.

## What this means

Every decision must move us toward a system that is:

**Explicit**
Contracts should be visible in code, not buried in CMS behavior.

**Native**
Versioning, previews, releases, and collaboration must follow Git workflows, not CMS inventions.

**Type-safe**
Content, theme, and renderer must fit together through real interfaces.

**Inspectable**
Humans and agents must work on the same source of truth.

**Authorable**
The system must stay approachable and expressive for content authors.

**Seamless**
Users must get the freedom of code without inheriting the burden of operating it.

## Decision filter

A good decision makes the system feel more like:

- code in Git
- explicit types
- safe hosted execution
- branch-based workflow
- inspectable contracts

A bad decision makes the system feel more like:

- hidden state
- proprietary editor logic
- schema-first modeling
- implicit theme contracts
- runtime magic
