type FastGlob = (
  pattern: string,
  options: {
    cwd: string;
    absolute: true;
    onlyFiles: true;
  },
) => Promise<string[]>;

type GlobModuleLoader = (specifier: string) => Promise<unknown>;

export async function glob(
  pattern: string,
  options: {
    cwd: string;
    importModule?: GlobModuleLoader;
  },
): Promise<string[]> {
  const load = options.importModule ?? ((specifier) => import(specifier));
  const fastGlob = await loadFastGlob(load);
  return fastGlob(pattern, {
    cwd: options.cwd,
    absolute: true,
    onlyFiles: true,
  });
}

async function loadFastGlob(load: GlobModuleLoader): Promise<FastGlob> {
  try {
    const module = (await load("fast-glob")) as { default?: unknown };
    if (typeof module.default !== "function") {
      throw new Error("Invalid fast-glob installation");
    }
    return module.default as FastGlob;
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        'Missing CLI dependency "fast-glob". Install with: pnpm add -D fast-glob',
      );
    }
    throw error;
  }
}

function isMissingModuleError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ERR_MODULE_NOT_FOUND"
  );
}
