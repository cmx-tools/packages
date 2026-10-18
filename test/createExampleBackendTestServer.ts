import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";

const ROOT_DIR = process.cwd();
const STARTUP_TIMEOUT = 60_000;

export type ExampleBackendTestServer = {
  url: URL;
  close(): Promise<void>;
};

export async function createExampleBackendTestServer({
  rootDir = ROOT_DIR,
}: {
  rootDir?: string;
} = {}): Promise<ExampleBackendTestServer> {
  const port = await findOpenPort();
  const url = new URL(`http://127.0.0.1:${port}`);
  const server = spawn("corepack", ["pnpm", "run", "example:host"], {
    cwd: rootDir,
    detached: true,
    env: {
      ...process.env,
      PORT: String(port),
    },
  });

  let output = "";
  server.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  server.stderr.on("data", (chunk) => {
    output += String(chunk);
  });
  try {
    await waitForServer(url, server);
  } catch (error) {
    await closeProcess(server);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n${output}`,
    );
  }

  return {
    url,
    close() {
      return closeProcess(server);
    },
  };
}

async function findOpenPort(): Promise<number> {
  const server = createServer();

  return await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        if (typeof address === "object" && address !== null) {
          resolve(address.port);
          return;
        }

        reject(
          new Error("example backend test port did not expose a TCP address"),
        );
      });
    });
  });
}

async function waitForServer(
  url: URL,
  server: ChildProcessWithoutNullStreams,
): Promise<void> {
  let lastError: unknown;
  const deadline = Date.now() + STARTUP_TIMEOUT;

  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`example backend exited with code ${server.exitCode}`);
    }

    try {
      await fetch(url);
      return;
    } catch (error) {
      lastError = error;
      await delay(50);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("example backend did not start");
}

async function closeProcess(
  server: ChildProcessWithoutNullStreams,
): Promise<void> {
  if (server.exitCode !== null || server.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    server.once("exit", () => {
      resolve();
    });
    if (server.pid !== undefined) process.kill(-server.pid, "SIGTERM");
  });
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
