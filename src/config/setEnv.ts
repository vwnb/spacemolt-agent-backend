import { spawnSync } from "node:child_process";

function run(cmd: string, args: string[], input?: string) {
  const r = spawnSync(cmd, args, { input, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  }
  return r.stdout.trim();
}

export function vercelEnvAdd(name: string, value: string, environment: "production" | "preview" | "development", cwd: string) {
  // vercel env add <name> <environment> <branch> reads value from stdin when piped in newer CLI; keep simple with --force via remove+add.
  try { run("npx", ["--yes", "vercel@latest", "env", "rm", name, environment, "-y"], undefined); } catch { /* ignore missing */ }
  const args = ["--yes", "vercel@latest", "env", "add", name, environment];
  const r = spawnSync("npx", args, { cwd, input: `${value}\n`, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || `Failed setting ${name}`);
}
