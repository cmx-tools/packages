import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createServer } from "node:net";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT_DIR = process.cwd();
const SCRIPT_TIMEOUT = 120_000;
const SCRIPT_MAX_BUFFER = 10 * 1024 * 1024;

export type ExampleBackendTestServer = {
  url: URL;
  close(): Promise<void>;
};

export async function createExampleBackendTestServer(): Promise<ExampleBackendTestServer> {
  await prepareExampleBackend();

  const port = await findOpenPort();
  const url = new URL(`http://127.0.0.1:${port}`);
  const server = spawn(
    "corepack",
    ["pnpm", "--filter", "@example/backend", "start"],
    {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        PORT: String(port),
      },
    },
  );

  await waitForServer(url, server);

  return {
    url,
    close() {
      return closeProcess(server);
    },
  };
}

async function prepareExampleBackend(): Promise<void> {
  await execFileAsync(
    "corepack",
    ["pnpm", "--filter", "@example/content", "run", "build"],
    {
      cwd: ROOT_DIR,
      timeout: SCRIPT_TIMEOUT,
      maxBuffer: SCRIPT_MAX_BUFFER,
    },
  );
  await execFileAsync(
    "corepack",
    ["pnpm", "--filter", "@example/backend", "run", "build"],
    {
      cwd: ROOT_DIR,
      timeout: SCRIPT_TIMEOUT,
      maxBuffer: SCRIPT_MAX_BUFFER,
    },
  );
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
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
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
  if (server.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    server.once("exit", () => {
      resolve();
    });
    server.kill();
  });
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
