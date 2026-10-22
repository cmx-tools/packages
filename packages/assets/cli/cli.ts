#!/usr/bin/env node
import { runCmxAssetsCli } from "./runCmxAssetsCli.js";

process.exitCode = await runCmxAssetsCli();
