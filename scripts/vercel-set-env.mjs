import { spawnSync } from 'node:child_process';

const env = { ...process.env };
const cwd = process.cwd();
function setEnv(name, value, target='production') {
  spawnSync('npx', ['--yes','vercel@latest','env','rm',name,target,'-y'], { cwd, encoding: 'utf8', env });
  const r = spawnSync('npx', ['--yes','vercel@latest','env','add',name,target], { cwd, input: `${value}\n`, encoding: 'utf8', env });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || `failed ${name}`);
  console.log(`set ${name} (${target})`);
}

setEnv('LLM_PROVIDER', env.LLM_PROVIDER || 'openrouter');
if (env.OPENROUTER_API_KEY) setEnv('OPENROUTER_API_KEY', env.OPENROUTER_API_KEY);
if (env.LLM_API_KEY) setEnv('LLM_API_KEY', env.LLM_API_KEY);
if (env.LLM_MODEL) setEnv('LLM_MODEL', env.LLM_MODEL);
if (env.LLM_BASE_URL) setEnv('LLM_BASE_URL', env.LLM_BASE_URL);
if (env.ALLOWED_ORIGIN) setEnv('ALLOWED_ORIGIN', env.ALLOWED_ORIGIN);
console.log('done');
