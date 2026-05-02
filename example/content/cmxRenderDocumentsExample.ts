import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderCmxDocuments } from "cmx-document-renderer";

const BUNDLE_DIR = "dist";
const DOCUMENT_DIR = "../backend/_db_content";

export async function cmxRenderDocumentsExample(): Promise<void> {
  const rendered = await renderCmxDocuments({
    bundleDir: BUNDLE_DIR,
  });

  if (rendered.result === "error") {
    throw new Error(
      rendered.diagnostics.map((item) => item.message).join("\n"),
    );
  }

  await mkdir(DOCUMENT_DIR, { recursive: true });
  for (const [name, entry] of Object.entries(rendered.entries)) {
    if (entry.result === "document") {
      await writeFile(
        path.join(DOCUMENT_DIR, `${name}.json`),
        `${JSON.stringify(entry.document, null, 2)}\n`,
        "utf8",
      );
    }
  }
}

await cmxRenderDocumentsExample();
