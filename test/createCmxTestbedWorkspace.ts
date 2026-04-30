import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type CmxTestbedWorkspace = {
  rootDir: string;
  writeSourceFiles(files: Record<string, string>): Promise<void>;
  readOutputFiles(
    outDir: string,
    fileNames: string[],
  ): Promise<Record<string, string>>;
};

export async function createCmxTestbedWorkspace(): Promise<CmxTestbedWorkspace> {
  const testbedDir = path.resolve(".cmx");
  await mkdir(testbedDir, { recursive: true });
  const rootDir = await mkdtemp(path.join(testbedDir, "testbed-"));

  return {
    rootDir,
    writeSourceFiles(files) {
      return writeSourceFiles(rootDir, files);
    },
    readOutputFiles,
  };
}

async function writeSourceFiles(
  rootDir: string,
  files: Record<string, string>,
): Promise<void> {
  await Promise.all(
    Object.entries(files).map(async ([relativePath, source]) => {
      const absolutePath = path.join(rootDir, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source, "utf8");
    }),
  );
}

async function readOutputFiles(
  outDir: string,
  fileNames: string[],
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  await Promise.all(
    fileNames.map(async (fileName) => {
      files[fileName] = await readFile(path.join(outDir, fileName), "utf8");
    }),
  );
  return files;
}
