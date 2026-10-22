import { watch } from "node:fs";
import path from "node:path";

export async function watchCmxAssets(options: {
  cwd: string;
  configPath: string;
  cacheDir: string;
  prepare(): Promise<unknown>;
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let preparing = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = (base: string, filename: string | null) => {
      if (!filename) return;
      const absolutePath = path.resolve(base, filename);
      if (
        absolutePath.startsWith(`${options.cacheDir}${path.sep}`) ||
        /(?:^|[/\\])(?:node_modules|\.git|\.cmx|dist)(?:[/\\]|$)|\.d\.[^/\\]+$/u.test(
          filename,
        )
      )
        return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void prepare(), 50);
    };
    const prepare = async () => {
      if (preparing) {
        pending = true;
        return;
      }
      preparing = true;
      do {
        pending = false;
        try {
          await options.prepare();
        } catch (error) {
          process.stderr.write(
            `${error instanceof Error ? error.message : "Asset preparation failed"}\n`,
          );
        }
      } while (pending);
      preparing = false;
    };
    const sourceWatcher = watch(
      options.cwd,
      { recursive: true },
      (_event, filename) => changed(options.cwd, filename),
    );
    const configDirectory = path.dirname(options.configPath);
    const configWatcher =
      configDirectory !== options.cwd
        ? watch(configDirectory, { recursive: true }, (_event, filename) =>
            changed(configDirectory, filename),
          )
        : undefined;
    const cleanup = () => {
      sourceWatcher.close();
      configWatcher?.close();
      if (timer) clearTimeout(timer);
      process.off("SIGINT", close);
      process.off("SIGTERM", close);
    };
    const close = () => {
      cleanup();
      resolve();
    };
    sourceWatcher.on("error", (error) => {
      cleanup();
      reject(error);
    });
    configWatcher?.on("error", (error) => {
      cleanup();
      reject(error);
    });
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });
}
