#!/usr/bin/env node
import { runCmxPublishCli } from "./runCmxPublishCli.js";

const exitCode = await runCmxPublishCli();
process.exit(exitCode);
