import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExecFileResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export async function execFileOutput(
  command: string,
  args: readonly string[],
  options?: { cwd?: string; maxBuffer?: number },
): Promise<ExecFileResult> {
  const maxBuffer = options?.maxBuffer ?? 20 * 1024 * 1024;
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      maxBuffer,
      cwd: options?.cwd,
    });
    return {
      stdout: stdout as string,
      stderr: (stderr as string) ?? "",
      exitCode: 0,
    };
  } catch (e: unknown) {
    const err = e as {
      code?: number | string | null;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    if (err.code === "ENOENT") throw e;
    const exitCode =
      typeof err.code === "number" && Number.isFinite(err.code) ? err.code : 1;
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "",
      exitCode,
    };
  }
}
