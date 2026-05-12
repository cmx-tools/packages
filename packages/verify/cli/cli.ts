#!/usr/bin/env node
import { runCmxVerifyCli } from "./cmxVerifyCli.js";

const exitCode = await runCmxVerifyCli();
process.exit(exitCode);
