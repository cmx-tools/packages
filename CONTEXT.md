# CMX context

Shared language for this repo. This file is intentionally compact; use `specs/cmx-concept-spec.md` when a term needs full context or examples.

## Language

**CMX** is a document model and toolchain for content authored as TSX/JSX-like modules. It renders authored program semantics into stable static Documents and hydrates those Documents back into framework-native values.

CMX language spans three layers:

- **Document Model** — stable static rich Documents.
- **Toolchain** — transitions from source to Bundle to Document, and from Document to hydrated runtime values.
- **Profiles** — opinionated conventions for specific use-cases.

### Authoring

- **Content Project** — Local authoring workspace.
- **Content Repository** — Source-side location the build side watches or checks out.
- **Content Source** — Authored modules selected for CMX processing.
- **CMX Intrinsics** — Optional intrinsic JSX authoring types for Content Projects targeting bare CMX. They describe intrinsic elements and their document-facing props, independently of application content policies.
- **Asset** — Non-code content colocated with Content Source.
- **Asset Reference** — Document Content value that points to a host-distributed Asset.

### Build

- **Bundler** — Toolchain role that turns Content Source into a Bundle.
- **Compile** — Transform authored source semantics into executable CMX program material.
- **Bundle** — Portable render artifact produced by the Bundler. Still program material.
- **CMX Runtime** — CMX-owned runtime code used by compiled Bundles during Document Rendering.
- **Document Rendering** — Build-side operation that renders selected exports from a Bundle into a CMX Document.

### Document Model

- **CMX Document** — Stable static render of content authored in CMX. Data, not program code.
- **Document Interface** — Declared boundary of a Document: imports, exports, and contract-relevant information for Hydration.
- **Document Content** — Stable static values rendered from selected source exports.
- **Export** — Rendered value exposed by a CMX Document. The source module's default export uses the `default` key.
- **Selected Export** — Source-module export chosen by Document Rendering for inclusion in the Document.
- **Document Import** — Component requirement declared in the Document Interface. Carries compatibility information, not implementation.
- **Component Reference** — Document Content value pointing to a component source and export.
- **Contract** — Shared compatibility agreement between Build and Application. The Document Interface carries the document side; the Environment carries the application side.
- **Document Verification** — Runtime check of CMX-owned fields and their internal consistency. Unrelated data, Environment compatibility, and application content restrictions are outside this check.
- **UGC Policy** — Application-selected restrictions on author-controlled content in a CMX Document. The React UGC Policy governs intrinsic elements and props, including intrinsic nodes in declared component slots.

Conceptual Document shape:

```ts
{
  interface: {
    imports: {},
    exports: {}
  },
  content: {
    default: {},
    meta: {},
    otherExport: {}
  }
}
```

This is concept language, not a final machine format.

### Hydration and rendering

- **Environment** — Hydration-side application context that proves compatibility with a Document and provides implementations for Document Imports.
- **Environment Import** — Component implementation supplied by the Environment.
- **CMX Hydration** — Runtime-side operation that verifies a Document against an Environment and binds Component References to implementations.
- **Contract Verification** — Hydration phase that compares the Document Interface with the Environment.
- **Import Binding** — Hydration phase that binds Component References to Environment Imports.
- **Framework Rendering** — Host framework operation that renders hydrated framework-native values to UI, HTML, a stream, DOM tree, or another framework-specific output.

`render` and `hydrate` are contextual terms:

- **Document Rendering** renders Bundles into Documents.
- **Framework Rendering** renders hydrated framework values into UI or HTML.
- **CMX Hydration** binds a CMX Document to an Environment.
- Framework/browser hydration may mean attaching client runtime behavior to existing HTML or DOM output.

### Profiles

- **Profile** — Opinionated convention for how Documents are shaped, validated, rendered, and hydrated for a use-case.

Profiles are not core Document fields. They may influence selected exports, validation rules, expected interface/content shape, Contract strictness, Hydration behavior, and framework adapter defaults.

### Host architecture

- **Host Architecture** — Overall system that adopts CMX for content management.
- **Host Role** — Responsibility in a Host Architecture. Roles may be grouped into one system or split across systems.
- **Source Host** — Owns or exposes the Content Repository.
- **Build Host** — Runs the CMX toolchain: compile Content Source into Bundles, then render Bundles into Documents.
- **Document Host** — Persists or serves CMX Documents.
- **Asset Host** — Distributes Assets referenced by Documents.
- **Application Build** — App/website build process that creates the Environment and encodes the application-side Contract.
- **Application Host** — App/website runtime that loads Documents, uses the Environment, performs CMX Hydration, and hands hydrated values to the framework.

## Pipeline summary

```txt
Content Project
→ Content Repository
→ Content Source + Assets
→ Compile
→ Bundle
→ Document Rendering
→ CMX Document
→ CMX Hydration with Environment
→ Framework-native values
→ Framework Rendering
→ UI / HTML
```
