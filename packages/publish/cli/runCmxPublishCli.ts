import { readFile } from "node:fs/promises";
import { text } from "node:stream/consumers";
import type { CmxDocument } from "@cmx-tools/contracts";
import { CmxPublicationError, publishCmxDocuments } from "../src/index.js";

export async function runCmxPublishCli(
  argv: readonly string[] = process.argv.slice(2),
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(
      "@cmx-tools/publish\n\nUsage:\n  cmx-publish <documents.json> <endpoint>\n  cmx-publish - <endpoint>\n\nUse - to read the complete Document entry map from stdin.\n\nOptions:\n  --help\n  --version\n",
    );
    return 0;
  }
  try {
    if (argv.includes("--version") || argv.includes("-v")) {
      const { readPackageVersionFromImportMetaUrl } =
        await import("@cmx-tools/cli");
      process.stdout.write(
        `${readPackageVersionFromImportMetaUrl(import.meta.url)}\n`,
      );
      return 0;
    }
    if (
      argv.length !== 2 ||
      (argv[0] !== "-" && argv[0].startsWith("-")) ||
      argv[1].startsWith("-")
    ) {
      process.stderr.write("Usage: cmx-publish <documents.json> <endpoint>\n");
      return 1;
    }
    const [file, endpoint] = argv;
    let documents: unknown;
    const source =
      file === "-" ? await text(process.stdin) : await readFile(file, "utf8");
    try {
      documents = JSON.parse(source);
    } catch (cause) {
      throw new Error(`Invalid JSON in ${file === "-" ? "stdin" : file}`, {
        cause,
      });
    }
    const result = await publishCmxDocuments({
      endpoint,
      documents: documents as Record<string, CmxDocument>,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const seen = new Set<Error>();
    const messages = new Set<string>();
    let cause: unknown = error;
    while (cause instanceof Error && !seen.has(cause)) {
      seen.add(cause);
      if (!messages.has(cause.message)) {
        messages.add(cause.message);
        process.stderr.write(`${cause.message}\n`);
      }
      cause = cause.cause;
    }
    if (messages.size === 0) {
      process.stderr.write("Document publication failed.\n");
    }
    if (
      error instanceof CmxPublicationError &&
      error.diagnostics !== undefined
    ) {
      for (const [entryName, diagnostics] of Object.entries(
        error.diagnostics,
      )) {
        for (const diagnostic of diagnostics) {
          process.stderr.write(
            `${entryName}: ${diagnostic.code}: ${diagnostic.message}\n`,
          );
        }
      }
    }
    return 1;
  }
}
