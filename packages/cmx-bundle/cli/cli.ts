#!/usr/bin/env node
import { runCmxBundleCli } from "./cmxBundleCli.js";

const exitCode = await runCmxBundleCli();
process.exit(exitCode);
