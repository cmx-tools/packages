import { watch, type FSWatcher } from "node:fs";
import path from "node:path";

export type CmxBundleWatchPaths = {
  cwd: string;
  configPath?: string;
  outDir: string;
  cacheDir?: string;
};

export async function watchCmxBundle(
  options: CmxBundleWatchPaths & {
    build(updatePaths: (paths: CmxBundleWatchPaths) => void): Promise<void>;
  },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const watchers = new Map<string, FSWatcher>();
    let ignoredDirectories: string[] = [];
    let closed = false;
    let building = false;
    let pending = false;
    let activeBuild = Promise.resolve();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const stop = (error?: Error) => {
      if (closed) return;
      closed = true;
      for (const watcher of watchers.values()) watcher.close();
      if (timer) clearTimeout(timer);
      process.off("SIGINT", close);
      process.off("SIGTERM", close);
      void activeBuild.then(() => (error ? reject(error) : resolve()), reject);
    };
    const close = () => stop();
    const changed = (directory: string, filename: string | null) => {
      if (closed || !filename) return;
      const absolute = path.resolve(directory, filename);
      if (
        ignoredDirectories.some((ignored) => containsPath(ignored, absolute)) ||
        /(?:^|[/\\])(?:node_modules|\.git|\.cmx)(?:[/\\]|$)|\.d\.[^/\\]+$/u.test(
          filename,
        )
      )
        return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(scheduleBuild, 50);
    };
    const updatePaths = (paths: CmxBundleWatchPaths) => {
      if (closed) return;
      const cwd = path.resolve(paths.cwd);
      ignoredDirectories = [
        path.resolve(cwd, paths.outDir),
        path.resolve(cwd, paths.cacheDir ?? ".cmx/assets"),
      ];
      const roots = [
        path.resolve(options.cwd),
        cwd,
        ...(paths.configPath
          ? [path.dirname(path.resolve(cwd, paths.configPath))]
          : []),
      ];
      const directories = [...new Set(roots)].filter(
        (directory, index, all) =>
          !all.some(
            (parent, parentIndex) =>
              parentIndex !== index && containsPath(parent, directory),
          ),
      );
      for (const [directory, watcher] of watchers) {
        if (!directories.includes(directory)) {
          watcher.close();
          watchers.delete(directory);
        }
      }
      for (const directory of directories) {
        if (watchers.has(directory)) continue;
        const watcher = watch(
          directory,
          { recursive: true },
          (_event, filename) => changed(directory, filename),
        );
        watcher.on("error", stop);
        watchers.set(directory, watcher);
      }
    };
    const runBuilds = async () => {
      building = true;
      do {
        pending = false;
        try {
          await options.build(updatePaths);
        } catch (error) {
          process.stderr.write(
            `${error instanceof Error ? error.message : "CMX build failed"}\n`,
          );
        }
      } while (pending && !closed);
      building = false;
    };
    function scheduleBuild() {
      if (closed) return;
      if (building) {
        pending = true;
        return;
      }
      activeBuild = runBuilds();
    }
    try {
      updatePaths(options);
      process.once("SIGINT", close);
      process.once("SIGTERM", close);
      scheduleBuild();
      void activeBuild.then(() => {
        if (!closed) process.stdout.write("Watching CMX sources.\n");
      }, stop);
    } catch (error) {
      stop(error instanceof Error ? error : new Error("CMX watcher failed"));
    }
  });
}

function containsPath(directory: string, filename: string): boolean {
  const relative = path.relative(directory, filename);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}
