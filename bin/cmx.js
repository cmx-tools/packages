#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function usage() {
  console.error("Usage: cmx dev [content-root]");
}

async function assertDirExists(targetPath, label) {
  let info;

  try {
    info = await stat(targetPath);
  } catch {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }

  if (!info.isDirectory()) {
    throw new Error(`Expected ${label} to be a directory: ${targetPath}`);
  }
}

async function assertValidPackageJson(packageJsonPath) {
  let raw;
  try {
    raw = await readFile(packageJsonPath, "utf8");
  } catch {
    throw new Error(`Missing package.json: ${packageJsonPath}`);
  }

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("must be a JSON object");
    }
  } catch (cause) {
    throw new Error(`Invalid package.json at ${packageJsonPath}: ${cause.message}`);
  }
}

async function writeContentEntry(contentRoot) {
  const sourceIndexFile = path.join(contentRoot, "pages", "index.tsx");

  try {
    const info = await stat(sourceIndexFile);
    if (!info.isFile()) {
      throw new Error();
    }
  } catch {
    throw new Error(`Missing page entry file: ${sourceIndexFile}`);
  }

  const generatedDir = path.join(projectRoot, ".cmx");
  await mkdir(generatedDir, { recursive: true });

  const relativeImportPath = path.relative(generatedDir, sourceIndexFile).split(path.sep).join("/");
  const normalizedImportPath = relativeImportPath.startsWith(".")
    ? relativeImportPath
    : `./${relativeImportPath}`;
  const extensionlessImportPath = normalizedImportPath.replace(/\.(tsx|ts|jsx|js)$/u, "");

  const generatedFile = path.join(generatedDir, "content-entry.tsx");
  const generatedCode = `export { default } from "${extensionlessImportPath}";\n`;
  await writeFile(generatedFile, generatedCode, "utf8");
}

async function runDev(contentRootArg) {
  const contentRoot = path.resolve(process.cwd(), contentRootArg ?? ".");
  const packageJsonPath = path.join(contentRoot, "package.json");
  const pagesDir = path.join(contentRoot, "pages");

  await assertValidPackageJson(packageJsonPath);
  await assertDirExists(pagesDir, "pages directory");
  await writeContentEntry(contentRoot);

  const child = spawn(
    process.execPath,
    [path.join(projectRoot, "node_modules", "astro", "bin", "astro.mjs"), "dev"],
    {
      cwd: projectRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        CMX_CONTENT_ROOT: contentRoot
      }
    }
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

async function main() {
  const [, , command, contentRootArg] = process.argv;

  if (command !== "dev") {
    usage();
    process.exit(1);
  }

  try {
    await runDev(contentRootArg);
  } catch (error) {
    console.error(`cmx dev failed: ${error.message}`);
    process.exit(1);
  }
}

await main();
