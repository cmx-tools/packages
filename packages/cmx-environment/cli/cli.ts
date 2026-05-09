#!/usr/bin/env node
import { runCmxEnvironmentCli } from "./cmxEnvironmentCli.js";

const exitCode = await runCmxEnvironmentCli();
process.exit(exitCode);
