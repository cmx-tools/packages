import type { CmxDocument } from "@cmx-tools/contracts";
import type {
  CmxPublicationManifest,
  CmxPublicationState,
} from "./cmxPublicationProtocol.js";
import { canonicalJson } from "./canonicalJson.js";

export function hashCmxDocument(document: CmxDocument): Promise<string> {
  return hashJson(document);
}

export function hashCmxPublicationManifest(
  manifest: CmxPublicationManifest,
): Promise<string> {
  return hashJson(manifest);
}

export async function createCmxPublicationState(
  documents: Record<string, CmxDocument>,
): Promise<CmxPublicationState> {
  const entries = await Promise.all(
    Object.entries(documents).map(
      async ([name, document]) =>
        [name, await hashCmxDocument(document)] as const,
    ),
  );
  const manifest = Object.fromEntries(entries);
  return { contentHash: await hashCmxPublicationManifest(manifest), manifest };
}

async function hashJson(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
