import { describe, expect, it } from "vitest";
import { runCmxCli } from "./cmxCli.js";

async function runCli(
  args: readonly string[],
  options?: Parameters<typeof runCmxCli>[1],
) {
  let stdout = "";
  let stderr = "";
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;

  try {
    const exitCode = await runCmxCli(args, options);
    return { exitCode, stdout, stderr };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

describe("cmx umbrella cli", () => {
  it("supports --help and --version", async () => {
    const help = await runCli(["--help"]);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("cmx <bundle|document|environment>");

    const version = await runCli(["--version"]);
    expect(version.exitCode).toBe(0);
    expect(version.stdout.trim()).toBe("0.1.0");
  });

  it("fails on unknown verb", async () => {
    const result = await runCli(["invalid"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Usage: cmx <bundle|document|environment>");
  });

  it("prints install hint when capability package is missing", async () => {
    const result = await runCli(["bundle"], {
      importModule: async () => {
        const error = new Error("missing") as Error & { code: string };
        error.code = "ERR_MODULE_NOT_FOUND";
        throw error;
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Missing capability package");
    expect(result.stderr).toContain("cmx-bundle");
  });

  it("delegates subcommand --help and --version", async () => {
    const result = await runCli(["bundle", "--help"], {
      importModule: async () => ({
        runCmxBundleCli: async (args: readonly string[]) => {
          process.stdout.write(`bundle:${args.join(" ")}\n`);
          return 0;
        },
      }),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("bundle:--help");
  });
});
