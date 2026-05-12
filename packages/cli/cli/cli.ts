#!/usr/bin/env node
import { runCmxCli } from "./cmxCli.js";

const exitCode = await runCmxCli();
process.exit(exitCode);
