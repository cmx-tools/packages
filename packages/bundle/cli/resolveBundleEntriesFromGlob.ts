import path from "node:path";

export async function resolveBundleEntriesFromGlob(options: {
  cwd: string;
  globPattern: string;
  glob: (pattern: string, options: { cwd: string }) => Promise<string[]>;
}): Promise<Record<string, string>> {
  const entryFiles = await options.glob(options.globPattern, {
    cwd: options.cwd,
  });
  const normalizedEntryFiles = entryFiles.map((file) =>
    path.resolve(options.cwd, file),
  );

  if (normalizedEntryFiles.length === 0) {
    throw new Error(`No files matched glob: ${options.globPattern}`);
  }

  return createEntryMap(normalizedEntryFiles);
}

function createEntryMap(files: readonly string[]): Record<string, string> {
  const entryRoot = findSharedAncestor(files);
  const entryMap: Record<string, string> = {};

  for (const file of files) {
    const entryName = toEntryName(entryRoot, file);
    if (entryMap[entryName] !== undefined) {
      throw new Error(`Duplicate bundle entry name derived: ${entryName}`);
    }
    entryMap[entryName] = file;
  }

  return entryMap;
}

function findSharedAncestor(files: readonly string[]): string {
  const directories = files.map((file) => path.dirname(path.resolve(file)));
  let ancestor = directories[0] ?? process.cwd();

  for (const directory of directories.slice(1)) {
    while (!isParentDirectory(ancestor, directory)) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) {
        return ancestor;
      }
      ancestor = parent;
    }
  }

  return ancestor;
}

function isParentDirectory(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function toEntryName(root: string, file: string): string {
  const relativePath = path.relative(root, path.resolve(file));
  const extension = path.extname(relativePath);
  const withoutExtension =
    extension.length > 0
      ? relativePath.slice(0, relativePath.length - extension.length)
      : relativePath;
  return withoutExtension.split(path.sep).join("/");
}
