import path from "node:path";

export function resolveCliCwd(
  cliCwd?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.resolve(cliCwd ?? env.CMX_CWD ?? process.cwd());
}
