# Keep document verification concerns independently callable

Applications loading stored CMX Documents may choose runtime Document Verification instead of trusting a type cast. Provide one standalone verifier for shape and internal consistency, including declared slot targets and component references to the document's own imports. It accepts unknown input and returns the unchanged typed document on success or diagnostics on failure. A boolean type predicate and a throwing assertion use the same verification. The assertion narrows the input type and throws a distinct error carrying the diagnostics. Separate shape and consistency verifiers have no current caller need.

Document Verification accepts no policy callback. Applications call content policies separately on typed CMX Documents. The CLI composes structural verification with its configured policy at the input boundary. Contract Verification belongs to Hydration and establishes compatibility with an Environment. The React UGC Policy restricts author-controlled intrinsic markup and can be applied independently of Document Verification.

Document Verification strongly checks CMX-owned fields and their relationships. Ordinary data remains opaque, except where declared slots identify CMX nodes. Declared exports must exist in content; extra content entries do not alone constitute an error. Rejecting unrelated fields or enforcing JSON serialization adds no value to this check. This tolerance does not introduce a container format or an extension mechanism.

The published JSON Schema remains unchanged and may impose stricter requirements than runtime Document Verification. These tools serve different validation needs; the runtime helper need not enforce every schema restriction.

Combining these checks made adopting a content policy also impose document trust decisions on the caller. Their results answer different questions: a document can conform to the document model while requiring components unavailable in an Environment or containing markup prohibited by a UGC Policy. Callers choose which checks to compose. Environment compatibility changes are outside this workstream.
