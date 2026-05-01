import type { ReactNode } from "react";
import type { CmxEnvironment } from "cmx-bundle";
import type { CmxDocument } from "cmx-document-renderer";

export type RenderCmxReactResult<Meta = unknown> = {
  children: ReactNode;
  meta?: Meta;
};

export function renderCmxReact<Meta = unknown>(
  _document: CmxDocument,
  _environment: CmxEnvironment<Meta>,
): RenderCmxReactResult<Meta> {
  throw new Error("renderCmxReact is a contract stub.");
}
