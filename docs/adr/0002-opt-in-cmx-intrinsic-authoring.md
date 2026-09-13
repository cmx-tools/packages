# Keep CMX intrinsic authoring independent of React and content policy

Content Projects targeting bare CMX can opt into CMX Intrinsics, while React-oriented Content Projects keep React's JSX types. CMX Intrinsics must work without React or its type packages; changing existing React component signatures or making them compatible with CMX's JSX types is outside this workstream.

Deliver supported HTML and SVG authoring types rather than a prototype-only comparison. The types catch unsupported values in declared intrinsic props, but allow serializable styling and raw HTML props. Application-selected UGC Policies govern content restrictions separately, so choosing CMX authoring types does not impose a content policy.

This decision narrows the implementation direction explored in [#126](https://github.com/cmx-tools/packages/issues/126): bare CMX authoring owns its type contract instead of requiring a React type dependency.

Custom elements require explicit JSX type declarations for their tags and props. Unknown tags do not automatically type-check, so misspelled standard tags remain visible to authors. This authoring constraint leaves the runtime's support for arbitrary string tags unchanged.

CMX Intrinsics follow standard HTML and SVG names but camel-case hyphenated and namespaced attributes, including `strokeWidth` and `xlinkHref`, so TypeScript can report misspelled JSX props. Keep `class`, `for`, `viewBox`, and conventional `data-*` and `aria-*` spelling. The React adapter translates CMX attribute names to React prop names, allowing bare CMX authoring to follow web conventions without taking a React dependency. Content authored with React intrinsic types must continue to hydrate correctly. Do not add dedicated validation for conflicting aliases without an observed problem that warrants it.

The `style` prop accepts CSS declaration strings and serializable style objects. The React adapter parses CSS strings into React's style-object format and passes existing style objects through. Preserve `!important` in converted values and leave its handling to React, without CMX errors or priority removal. Bare CMX exposes raw markup as `innerHTML: string`, which the React adapter converts to `dangerouslySetInnerHTML`. React-authored `dangerouslySetInnerHTML` remains supported. These value conversions do not change the independently applied UGC Policy.

Move intrinsic content verification to an independently callable CMX UGC verifier. Its base policy checks the CMX intrinsic dialect. Callers explicitly supply a React policy to extend those checks to React-dialect props; the extension adds to the base checks rather than replacing them. Verification runs on Document nodes before framework-specific conversion, including intrinsic nodes in declared slots. Component-owned props remain outside its scope, and Hydration does not apply the policy automatically.

Expose `assertCmxUgc` and `createCmxUgcVerifier` from `@cmx-tools/verify`, with an optional `policy` value that adds checks to the base CMX policy. Export `reactUgcPolicy` from `@cmx-tools/verify/react`. Both verifier entry points retain the `allowedElements` option alongside policy selection.

The standalone `@cmx-tools/intrinsics` package owns the opt-in JSX authoring contract. Content Projects select it through `jsxImportSource: "@cmx-tools/intrinsics"` with TypeScript's automatic JSX transform. Its JSX entry points supply the authoring types and forward execution to `@cmx-tools/runtime`, keeping the authoring contract independently selectable while sharing the existing execution behavior. React-oriented authoring configuration remains unchanged.

Type checking is authoring guidance, not proof that a Document can be rendered. TypeScript permits undeclared hyphenated JSX attributes without checking their values, as described in its [JSX attribute checking documentation](https://www.typescriptlang.org/docs/handbook/jsx.html#attribute-type-checking). Extra properties supplied through spreads can also escape JSX checking. The event-name index signature and explicit ref declaration let TypeScript reject those props in direct attributes and spreads. Document Rendering remains the final serialization check.

Accept these TypeScript limitations without adding a compiler plugin or lint system to this workstream.
