import type { ReactNode } from "react";
import type { CmxDocument, CmxEnvironment } from "cmx-contracts";

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
