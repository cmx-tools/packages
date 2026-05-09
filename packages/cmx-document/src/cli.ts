#!/usr/bin/env node
import { runCmxDocumentCli } from "./cmxDocumentCli.js";

try {
  const exitCode = await runCmxDocumentCli();
  process.exit(exitCode);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Unknown error"}\n`,
  );
  process.exit(1);
}
