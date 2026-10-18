import type { CmxDiagnostic, CmxDocument } from "@cmx-tools/contracts";

export type CmxPublicationManifest = Record<string, string>;

export type CmxPublicationState = {
  contentHash: string;
  manifest: CmxPublicationManifest;
};

export type CmxPublicationDelta = {
  baseContentHash: string;
  targetContentHash: string;
  upsert: Record<string, CmxDocument>;
  remove: string[];
};

export type CmxPublicationResult = { contentHash: string };

export type CmxPublicationDiagnostics = Record<string, CmxDiagnostic[]>;

export type CmxPublicationRejection = {
  message: string;
  diagnostics?: CmxPublicationDiagnostics;
};
