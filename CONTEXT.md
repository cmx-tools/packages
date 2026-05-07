# CMX context

Shared vocabulary for this repo.

Normative machine-readable shape details may live in issues or implementation specs. This file captures compact language for discussing CMX concepts. See `specs/cmx-concept-spec.md` for the fuller concept specification.

## Language

### CMX

**CMX** is a document model and toolchain for content authored as TSX/JSX-like modules. It preserves rich authored semantics in stable, static Documents and lets applications hydrate those Documents back into framework-native values.

CMX has three layers:

- **Document Model** — the stable, static rich document format.
- **Toolchain** — the transitions from authored source to Bundle to Document, and from Document to hydrated runtime values.
- **Profiles** — opinionated conventions for specific use-cases.

### Authoring

- **Content Project** — The local authoring workspace where authored content, colocated Assets, package configuration, scripts, and supporting files live.
- **Content Repository** — The source-side location, often a Git remote, that the build side watches or checks out.
- **Content Source** — The authored modules selected for CMX processing.
- **Asset** — Non-code content such as images, blobs, media, or files colocated with Content Source.
- **Asset Reference** — A Document Content value that points to an Asset distributed by the host architecture.

### Build

- **Bundler** — The CMX toolchain role that turns Content Source into a Bundle.
- **Compile** — Transform authored source semantics into executable CMX program material.
- **Bundle** — A portable render artifact produced by the Bundler. A Bundle is still program material and may contain compiled modules, chunks, runtime calls, sourcemaps, and references to Assets.
- **CMX Runtime** — CMX-owned runtime code used by compiled Bundles during Document Rendering. It belongs to the build/toolchain side, not Hydration.
- **Document Rendering** — The build-side operation that renders selected exports from a Bundle into a CMX Document.

### Document Model

- **CMX Document** — A stable, static render of content authored in CMX. A Document is data, not program code.
- **Document Interface** — The declared boundary of a Document. It describes what the Document imports, what it exports, and contract-relevant information needed for Hydration.
- **Document Content** — The stable static values rendered from selected source exports.
- **Export** — A rendered value exposed by a CMX Document. The source module's default export is represented by the `default` key.
- **Selected Export** — A source-module export chosen by Document Rendering to be included in the Document.
- **Document Import** — A component requirement declared in the Document Interface. It identifies a component source used by Document Content and carries compatibility information for Contract Verification. It does not contain the implementation.
- **Component Reference** — A value inside Document Content that points to a component source and export.
- **Contract** — The shared compatibility agreement between the Build side and the Application side. Document Rendering writes document-side contract information into the Document Interface. Application Build writes application-side contract information into the Environment.

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

- **Environment** — The hydration-side context owned by the application. It proves compatibility with a Document and provides implementations for Document Imports.
- **Environment Import** — A component implementation supplied by the Environment.
- **CMX Hydration** — The runtime-side step that turns a static CMX Document into framework-native values by verifying the Document against an Environment and binding component references to implementations.
- **Contract Verification** — The Hydration phase that compares the Document Interface with the Environment.
- **Import Binding** — The Hydration phase that binds Component References in Document Content to component implementations supplied by Environment Imports.
- **Framework Rendering** — What the host framework does after CMX Hydration. It renders hydrated framework-native values to UI, HTML, a stream, a DOM tree, or another framework-specific output.

`render` is contextual language:

- In the CMX build context, **Document Rendering** renders Bundles into Documents.
- In the framework context, **Framework Rendering** renders hydrated framework values into UI or HTML.

`hydrate` is contextual language:

- In the CMX context, **CMX Hydration** binds a CMX Document to an Environment.
- In a browser/framework context, hydration may mean attaching client runtime behavior to existing HTML or DOM output.

### Profiles

- **Profile** — An opinionated convention for how Documents are shaped, validated, rendered, and hydrated for a use-case.

Profiles are not core Document fields. They may influence selected exports, validation rules, expected interface/content shape, Contract strictness, Hydration behavior, and framework adapter defaults.

### Host architecture

- **Host Architecture** — The overall system that adopts CMX for content management.
- **Host Role** — A responsibility in the Host Architecture. A Host Architecture may group multiple roles into one system or split one role across multiple systems.
- **Source Host** — Owns or exposes the Content Repository.
- **Build Host** — Runs the CMX toolchain. It compiles Content Source into Bundles and performs Document Rendering.
- **Document Host** — Persists or serves CMX Documents.
- **Asset Host** — Distributes Assets referenced by Documents.
- **Application Build** — The app or website build process that creates the Environment and encodes the application-side Contract.
- **Application Host** — The app or website runtime that loads Documents, uses the Environment, performs CMX Hydration, and hands hydrated values to the framework for rendering.

### Pipeline summary

```txt
Authoring
Content Project
→ Content Repository
→ Content Source

Build
Content Source + Assets
→ Compile
→ Bundle
→ Document Rendering
→ CMX Document

Document Model
CMX Document
→ Document Interface
→ Document Content

Application
Application Build
→ Environment

Runtime
CMX Document + Environment
→ Contract Verification
→ Import Binding
→ Framework-native values
→ Framework Rendering
→ UI / HTML
```

## Glossary

- **Hop** — Handoff between layers: one part produces a value, another stores or routes it, another operates and may return. Process term, not a network hop.
- **Leaf** — A part of the system's responsibility tree that no longer delegates to other parts.
