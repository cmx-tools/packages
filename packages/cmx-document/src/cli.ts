#!/usr/bin/env node
import { runCmxDocumentCli } from "./cmxDocumentCli.js";

const exitCode = await runCmxDocumentCli();
process.exit(exitCode);
