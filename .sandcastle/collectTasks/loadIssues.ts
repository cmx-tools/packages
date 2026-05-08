#!/usr/bin/env node
import { collectIssues } from "./collectIssues.js";

async function main(): Promise<void> {
  const taskUrls = process.argv.slice(2);
  if (taskUrls.length === 0) {
    console.error(
      "Usage: loadIssues <github-issue-or-milestone-url> [...]\n" +
        "Prints the same # Issues text ralph would feed into the loop.",
    );
    process.exit(1);
  }
  try {
    const out = await collectIssues(taskUrls);
    process.stdout.write(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    process.exit(1);
  }
}

void main();
