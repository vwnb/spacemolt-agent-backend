import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawnSync } from "node:child_process";
import { LLM_PROVIDER_OPTIONS, resolveModel } from "../reasoning/models.js";

function sh(args: string[], inp?: string) {
  const r = spawnSync("npx", ["--yes", "vercel@latest", ...args], { input: inp, encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || "").trim());
  return (r.stdout || "").trim();
}
function removeEnv(name: string, target = "production") {
  spawnSync("npx", ["--yes", "vercel@latest", "env", "rm", name, target, "-y"], { encoding: "utf8" });
}
function setEnv(name: string, value: string, target = "production") {
  removeEnv(name, target);
  const r = spawnSync("npx", ["--yes", "vercel@latest", "env", "add", name, target], { input: `${value}\n`, encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `failed setting ${name}`).trim());
  console.log(`set ${name}`);
}

async function main() {
  const rl = createInterface({ input, output });
  try {
    console.log("Vercel user:", sh(["whoami"]));
    const project = (await rl.question("Vercel project name [spacemolt-agent-backend]: ")).trim() || "spacemolt-agent-backend";
    try { sh(["link", "--yes", "--project", project]); } catch { console.log("Link failed; create/link project in Vercel then rerun."); throw new Error("vercel link required"); }

    console.log("\nLLM providers:");
    LLM_PROVIDER_OPTIONS.forEach((p, i) => console.log(`${i + 1}. ${p.label} (${p.key})`));
    const pick = (await rl.question("Pick provider [1]: ")).trim() || "1";
    const provider = LLM_PROVIDER_OPTIONS[Number(pick) - 1] || LLM_PROVIDER_OPTIONS[0];
    let model = provider.defaultModel;
    if (provider.models.length) {
      console.log("\nModels:");
      provider.models.forEach((m, i) => console.log(`${i + 1}. ${m.id}${m.free ? " [free]" : ""}`));
      const mp = (await rl.question(`Pick model [1]: `)).trim() || "1";
      model = provider.models[Number(mp) - 1]?.id || provider.defaultModel;
    } else {
      model = (await rl.question("Model id: ")).trim();
    }
    const keyPrompt = provider.key === "openrouter" ? "OPENROUTER_API_KEY: " : "LLM_API_KEY: ";
    const apiKey = (await rl.question(keyPrompt)).trim();
    if (!apiKey) throw new Error("API key required");
    const baseUrl = provider.key === "openapi" ? (await rl.question("LLM_BASE_URL: ")).trim() : provider.baseUrl;
    const allowedOrigin = (await rl.question("Allowed frontend origin (e.g. https://my-app.vercel.app) [none]: ")).trim();

    setEnv("LLM_PROVIDER", provider.key);
    setEnv("LLM_MODEL", resolveModel(provider, model));
    if (provider.key === "openrouter") setEnv("OPENROUTER_API_KEY", apiKey);
    else { setEnv("LLM_API_KEY", apiKey); setEnv("LLM_BASE_URL", baseUrl); }
    if (allowedOrigin) setEnv("ALLOWED_ORIGIN", allowedOrigin);
    else removeEnv("ALLOWED_ORIGIN");
    console.log("Done. Deploy with: npx vercel@latest --prod");
  } finally { rl.close(); }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
