import { readFile } from "node:fs/promises";
import path from "node:path";
import { text } from "node:stream/consumers";
import type { CmxDocument } from "@cmx-tools/contracts";
import { CmxPublicationError, publishCmxDocuments } from "../src/index.js";

export async function runCmxPublishCli(
  argv: readonly string[] = process.argv.slice(2),
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(
      "@cmx-tools/publish\n\nUsage:\n  cmx-publish <documents.json> <endpoint>\n  cmx-publish - <endpoint>\n\nUse - to read the complete Document entry map from stdin.\n\nOptions:\n  --cwd <path>\n  --config <path>\n  --help\n  --version\n",
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
    const positionals: string[] = [];
    for (let index = 0; index < argv.length; index += 1) {
      const argument = argv[index];
      if (argument === "--cwd" || argument === "--config") {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith("-")) {
          throw new Error(`${argument} requires a value`);
        }
        index += 1;
      } else if (argument !== "-" && argument.startsWith("-")) {
        throw new Error(`Unknown option: ${argument}`);
      } else {
        positionals.push(argument);
      }
    }
    if (positionals.length !== 2 || positionals[1] === "-") {
      process.stderr.write("Usage: cmx-publish <documents.json> <endpoint>\n");
      return 1;
    }
    const [file, endpoint] = positionals;
    const { resolveCmxCliConfig } = await import("@cmx-tools/cli");
    const config = await resolveCmxCliConfig({ argv });
    if (
      config.publish?.fetch !== undefined &&
      typeof config.publish.fetch !== "function"
    ) {
      throw new Error("CMX config publish.fetch must be a function.");
    }
    let documents: unknown;
    const source =
      file === "-"
        ? await text(process.stdin)
        : await readFile(path.resolve(config.cwd, file), "utf8");
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
      fetch: config.publish?.fetch,
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
