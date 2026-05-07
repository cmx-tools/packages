# CMX Concept Specification

## 1. Purpose

CMX is a document model and toolchain for content authored as TSX/JSX-like modules.

Its core purpose is to preserve rich authored semantics in a stable, static document format, and to allow applications to hydrate those documents back into framework-native values.

CMX sits between authored program code and application rendering:

```txt
Authored Content Source
→ compiled Bundle
→ rendered CMX Document
→ hydrated framework-native value
→ framework-rendered UI
```

CMX is therefore both:

1. a **Document Model** for static rich documents, and
2. a **Toolchain** for moving between authored modules, static documents, and runtime/framework values.

Opinionated use-cases, defaults, and stricter validation rules are expressed through **Profiles**.

## 2. Bounded contexts

CMX language is split across several bounded contexts. The same word may have different meanings in different contexts, as long as the context is clear.

### Authoring context

The authoring context is where content is written.

Core terms:

```txt
Content Project
Content Repository
Content Source
Asset
```

### Build context

The build context turns authored source into stable documents.

Core terms:

```txt
Compile
Bundler
Bundle
Document Rendering
CMX Runtime
Document
```

### Document context

The document context describes the static CMX artifact.

Core terms:

```txt
Document
Document Interface
Document Content
Document Import
Component Reference
Export
Selected Export
Contract
```

### Hydration context

The hydration context turns static CMX data into framework-native runtime values.

Core terms:

```txt
Environment
Environment Import
CMX Hydration
Contract Verification
Import Binding
Framework Rendering
```

### Host architecture context

The host architecture context describes the systems adopting CMX.

Core terms:

```txt
Host Architecture
Host Role
Source Host
Build Host
Document Host
Asset Host
Application Build
Application Host
```

## 3. Authoring model

An author works in a **Content Project**.

A Content Project is the local workspace where authored content, colocated assets, package configuration, scripts, and supporting files live.

The actual authored modules inside that project are **Content Source**.

A Content Project may contain many files that are useful for authoring, development, or tooling. Only the authored modules selected for CMX processing are Content Source.

When the author commits and pushes the project, the remote source location becomes the **Content Repository**.

The Content Repository is the source-side input for the build system.

Example flow:

```txt
Author edits Content Source
inside a local Content Project,
then pushes it to a Content Repository.
```

## 4. Assets

An **Asset** is non-code content such as an image, blob, media file, or other file colocated with Content Source.

CMX supports the authoring ergonomics of colocated assets.

Documents contain **Asset References**, while the host architecture owns asset distribution.

Example:

```txt
Content Source may reference a colocated image.
The Bundle carries enough information for Document Rendering.
The Document contains an Asset Reference.
The Asset Host distributes the referenced asset.
```

Assets are part of the authoring and host architecture story. They are not embedded directly into CMX Documents.

## 5. Build toolchain

The **Bundler** is the CMX toolchain role that turns Content Source into a Bundle.

**Compile** means transforming authored source semantics into executable CMX program material.

**Bundle** means packaging that compiled program material into a portable render artifact.

From the outside, these can be described together:

```txt
The Bundler compiles Content Source into a Bundle.
```

More precisely:

```txt
Content Source
→ compile
→ compiled CMX program material
→ bundle
→ Bundle
```

A **Bundle** is still program material.

It may contain compiled modules, chunks, runtime calls, local composition, variables, sourcemaps, references to assets, and information needed for Document Rendering.

A Bundle is not the static content artifact. It is the renderable artifact that still has to be rendered into Documents.

## 6. CMX Runtime

The **CMX Runtime** is CMX-owned runtime code used by compiled Bundles during Document Rendering.

It belongs to the build/toolchain side.

It is distinct from:

```txt
Environment
Framework Runtime
Application Host
```

The CMX Runtime helps execute Bundles and create CMX Documents. It is not a Document Import and is not supplied by the Environment during Hydration.

## 7. Document Rendering

**Document Rendering** is the build-side operation that renders selected exports from a Bundle into a CMX Document.

This is the key CMX transition:

```txt
Bundle
→ Document Rendering
→ Document
```

A Bundle is program material.

A Document is stable, static data.

Document Rendering executes the compiled CMX program material and records the rendered semantics as a CMX Document.

## 8. CMX Document

A **CMX Document** is a stable, static render of content authored in CMX.

It is data, not program code.

A Document is the core artifact of the CMX Document Model. It can be passed between systems, stored, loaded, hydrated, and rendered by applications.

Conceptually, a CMX Document has two parts:

```txt
Document Interface
Document Content
```

The Document Interface describes the boundary of the Document.

The Document Content contains the stable static values rendered from selected source exports.

Illustrative shape:

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

This is conceptual language, not a final machine format.

## 9. Document Interface

The **Document Interface** is the declared boundary of a CMX Document.

It describes:

```txt
- what the Document imports
- what the Document exports
- contract-relevant information needed for Hydration
```

The Document Interface is the document-side representation of the Contract between the Build side and the Application side.

Document Rendering writes contract-relevant information into the Document Interface.

CMX Hydration later verifies the Document Interface against the Environment.

## 10. Document Content

**Document Content** contains the stable static values rendered from selected source exports.

If the source module contains:

```ts
export default <Page />;
export const meta = { title: "Home" };
export const teaser = <Teaser />;
export const draftNotes = "internal";
```

A CMX rendering step may select only some exports:

```txt
default
meta
```

The resulting Document Content would conceptually contain:

```ts
{
  default: {},
  meta: {
    title: "Home"
  }
}
```

The `default` key represents the source module's default export.

## 11. Exports and Selected Exports

An **Export** is a rendered value exposed by a CMX Document.

Exports come from source-module exports.

The source module's default export is represented by the `default` key.

A **Selected Export** is an export chosen by Document Rendering to be included in the Document.

Profiles and toolchain configuration can influence which exports are selected.

Example:

```ts
export default <Page />;
export const meta = { title: "Home" };
export const draftNotes = "internal";
```

A Page Profile might select:

```txt
default
meta
```

and leave `draftNotes` out of the Document.

## 12. Document Imports

A **Document Import** is a component requirement declared in the Document Interface.

It identifies a component source used by Document Content and carries the compatibility information needed for Contract Verification.

A Document Import does not contain the implementation.

It says what the Document needs from the Application side during Hydration.

Example concept:

```txt
Document Interface imports:
@acme/ui-library
```

This says that the Document contains Component References that require compatible component implementations from `@acme/ui-library`.

## 13. Component References

A **Component Reference** is a value inside Document Content that points to a component source and export.

Component References are where static Document Content refers to component implementations that must be supplied by the Environment.

Example concept:

```ts
{
  type: "component",
  from: "@acme/ui-library",
  import: "Header"
}
```

The Component Reference lives in Document Content.

The corresponding Document Import lives in the Document Interface.

The implementation lives in the Environment.

## 14. Contract

The **Contract** is the shared compatibility agreement between the Build side and the Application side.

The Build side encodes document-side contract information into the Document Interface.

The Application Build encodes application-side contract information into the Environment.

CMX verifies the Contract before Hydration proceeds.

Conceptually:

```txt
Build Host
→ Document Interface

Application Build
→ Environment

Document Interface + Environment
→ Contract Verification
```

The Contract can include several aspects:

```txt
Dependency Contract
Component Contract
Meta Contract
```

### Dependency Contract

The package-level compatibility part of the Contract.

It ensures that the Document and Environment agree on the relevant package expectations.

### Component Contract

The agreement that Component References in Document Content can be satisfied by component implementations supplied by the Environment.

### Meta Contract

The agreement about the shape and meaning of Document meta for a given Environment or Profile.

## 15. Environment

An **Environment** is the hydration-side context owned by the application.

It has two conceptual responsibilities:

```txt
1. prove compatibility with a Document
2. provide implementations for Document Imports
```

The Environment is created by the **Application Build**.

The **Application Host** uses the Environment during CMX Hydration.

The Environment is not the CMX Runtime. The CMX Runtime belongs to Document Rendering. The Environment belongs to Hydration.

## 16. Environment Imports

An **Environment Import** is a component implementation supplied by the Environment.

Document Imports describe what the Document needs.

Environment Imports provide the actual implementations.

Conceptually:

```txt
Document Import:
@acme/ui-library

Environment Import:
@acme/ui-library → actual module namespace / component implementations
```

Hydration binds Component References in Document Content to Environment Imports after the Contract has been verified.

## 17. CMX Hydration

**CMX Hydration** is the runtime-side step that turns a static CMX Document into framework-native values.

Hydration combines:

```txt
Document
Environment
```

and produces:

```txt
framework-native values
```

CMX Hydration has two conceptual phases:

```txt
Contract Verification
Import Binding
```

### Contract Verification

**Contract Verification** compares the Document Interface with the Environment.

It checks whether the Application side satisfies the expectations encoded by the Build side.

If verification succeeds, Hydration can continue.

### Import Binding

**Import Binding** binds Component References in Document Content to component implementations supplied by Environment Imports.

After Import Binding, the Document Content can become framework-native values.

## 18. Framework Rendering

**Framework Rendering** is what the host framework does after CMX Hydration.

CMX Hydration produces framework-native values.

The framework then renders those values to UI, HTML, a stream, a DOM tree, or another framework-specific output.

Example:

```txt
CMX Document + Environment
→ CMX Hydration
→ React tree
→ React rendering
→ HTML/UI
```

The term **render** appears in two bounded contexts:

```txt
CMX build context:
Document Rendering renders Bundles into Documents.

Framework context:
Framework Rendering renders hydrated framework values into UI/HTML.
```

The context determines the meaning.

## 19. CMX Hydration and Framework Hydration

CMX Hydration is distinct from browser or framework hydration.

CMX Hydration:

```txt
CMX Document + Environment
→ framework-native values
```

Framework/browser hydration:

```txt
HTML/DOM + client runtime
→ interactive UI
```

The analogy is intentional: both steps enrich a static wire format with runtime behavior or implementations for a downstream system.

The bounded context must make clear whether we mean CMX Hydration or framework/browser hydration.

## 20. Profiles

A **Profile** is an opinionated convention for how Documents are shaped, validated, rendered, and hydrated for a use-case.

Profiles are a convention layer. They are not core Document fields.

A Profile may influence:

```txt
- selected exports
- validation rules
- expected Document Interface shape
- expected Document Content shape
- Contract strictness
- Hydration behavior
- framework adapter defaults
```

Example Profiles:

### Page Profile

A Page Profile might select:

```txt
default
meta
```

It may treat the default export as primary page content and interpret `meta` as page metadata.

### Strict Static Profile

A Strict Static Profile may apply stricter validation rules around script-like, style-like, or interactive values.

### Data Profile

A Data Profile may select structured data exports and hydrate or interpret them without treating the default export as page content.

Profiles let CMX provide useful defaults and presets while keeping the core Document Model open.

## 21. Host Architecture

A **Host Architecture** is the overall system that adopts CMX for content management.

A Host Architecture is made of **Host Roles**.

A **Host Role** is a responsibility in the Host Architecture. A Host Architecture may group multiple roles into one system or split one role across multiple systems.

Core Host Roles:

```txt
Source Host
Build Host
Document Host
Asset Host
Application Build
Application Host
```

### Source Host

The **Source Host** owns or exposes the Content Repository.

Examples include Git hosting, a source database, or another system that provides Content Source to the build side.

### Build Host

The **Build Host** runs the CMX toolchain.

It compiles Content Source into Bundles and performs Document Rendering.

It writes document-side contract information into the Document Interface.

### Document Host

The **Document Host** persists or serves CMX Documents.

Document hosting is app-owned architecture. It can use a filesystem, database, object storage, deployment artifact, in-memory cache, or another storage mechanism.

### Asset Host

The **Asset Host** distributes Assets referenced by Documents.

CMX Documents can contain Asset References. The Asset Host owns how those references become available to the application or end user.

### Application Build

The **Application Build** is the app or website build process that creates the Environment.

It encodes the application-side Contract into the Environment.

### Application Host

The **Application Host** is the app or website runtime.

It loads Documents, uses the Environment, performs CMX Hydration, and hands hydrated values to the framework for rendering.

## 22. End-to-end example

An author creates a page in a local Content Project:

```ts
import { PageShell } from "@acme/ui";

export const meta = {
  title: "About"
};

export default (
  <PageShell>
    About us
  </PageShell>
);
```

The author pushes the project to a Content Repository.

The Source Host exposes that repository to the Build Host.

The Build Host runs the Bundler.

The Bundler compiles the Content Source into a Bundle.

The Bundle is still program material. It contains compiled code and references to the CMX Runtime and external component requirements.

The Build Host performs Document Rendering.

Document Rendering renders the selected exports, for example `default` and `meta`, into a CMX Document.

The Document Interface records that the Document imports `@acme/ui`.

The Document Content contains:

```txt
default → static CMX content containing a Component Reference to PageShell
meta → static data containing the title
```

The Document Host makes the Document available to the application.

The Application Build creates an Environment. The Environment proves compatibility with `@acme/ui` and provides the actual component implementation.

The Application Host loads the Document and Environment.

CMX Hydration verifies the Document Interface against the Environment.

Then Import Binding binds the `PageShell` Component Reference to the implementation supplied by the Environment.

Hydration produces framework-native values.

The host framework renders those values to UI or HTML.

The user sees the rendered page.

## 23. Conceptual pipeline summary

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

## 24. Core boundaries

The most important CMX boundaries are:

```txt
Content Source = authored program source
Bundle = renderable program material
Document = stable static data
Environment = application-side compatibility and implementation context
Hydration = static document + environment → runtime/framework values
Framework Rendering = framework values → UI/HTML
```

CMX is responsible for the transitions into and out of the Document Model.

The Host Architecture owns where source, documents, assets, environments, and rendered output live.
