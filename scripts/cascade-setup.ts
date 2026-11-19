// One-time local setup for the Cascade demo: starts nothing, only configures a running Bifrost.
//
//   1. Start Bifrost (v2.6+):  BIFROST_SETUP_TOKEN=<random> npx -y @maximhq/bifrost -app-dir .local/bifrost -port 8089
//   2. Put NVIDIA_API_KEY and the same BIFROST_SETUP_TOKEN in .env
//   3. npm run cascade:setup        (idempotent; writes BIFROST_VIRTUAL_KEY to .env)
//
// It registers NVIDIA NIM as an OpenAI-compatible Bifrost provider, allows only the Cascade tier
// models, and creates a governed virtual key with a daily budget for Cascade to use.
import { readFile, writeFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../packages/cascade/src/index';

try {
  process.loadEnvFile?.();
} catch {
  /* .env is optional until the end */
}

const gateway = process.env.BIFROST_GATEWAY_URL ?? 'http://127.0.0.1:8089';
const token = process.env.BIFROST_SETUP_TOKEN;
if (!token) throw new Error('Set BIFROST_SETUP_TOKEN in .env (the same value Bifrost was started with).');
if (!process.env.NVIDIA_API_KEY) throw new Error('Set NVIDIA_API_KEY in .env.');

const PROVIDER = 'nvidia';
const strip = (model: string) => model.replace(/^nvidia\//, '');
const models = [...new Set([strip(DEFAULT_CONFIG.small.model), strip(DEFAULT_CONFIG.large.model)])];
const headers = { 'content-type': 'application/json', 'X-Bifrost-Setup-Token': token };

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(`${gateway}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok && response.status !== 404) throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 300)}`);
  return { status: response.status, json };
}

// 1. Provider: NVIDIA NIM through Bifrost's OpenAI-compatible custom provider.
const existing = await call('GET', `/api/providers/${PROVIDER}`);
if (existing.status === 404) {
  await call('POST', '/api/providers', {
    provider: PROVIDER,
    keys: [{ name: 'nim', value: 'env.NVIDIA_API_KEY', models, weight: 1 }],
    network_config: { base_url: 'https://integrate.api.nvidia.com', default_request_timeout_in_seconds: 120 },
    custom_provider_config: { base_provider_type: 'openai', allowed_requests: { chat_completion: true, chat_completion_stream: true, list_models: true } },
  });
  console.log('Registered the nvidia provider.');
}
const keys = (await call('GET', `/api/providers/${PROVIDER}/keys`)).json.keys as Array<{ id: string; name: string }>;
const key = keys[0];
await call('PUT', `/api/providers/${PROVIDER}/keys/${key.id}`, { name: key.name, value: 'env.NVIDIA_API_KEY', models, weight: 1, enabled: true });
console.log(`Provider key allows: ${models.join(', ')}`);

// 2. Governed virtual key for Cascade: these models only, $5 a day.
const list = (await call('GET', '/api/governance/virtual-keys')).json.virtual_keys as Array<{ id: string; name: string; value?: string }> | null;
let vk = list?.find(v => v.name === 'proofbench-cascade');
const providerConfigs = [{ provider: PROVIDER, weight: 1, key_ids: [key.id], allowed_models: models }];
if (!vk) {
  vk = (await call('POST', '/api/governance/virtual-keys', { name: 'proofbench-cascade', description: 'ProofBench Cascade router', is_active: true, provider_configs: providerConfigs, budgets: [{ max_limit: 5, reset_duration: '1d' }] })).json.virtual_key;
  console.log('Created virtual key proofbench-cascade with a $5/day budget.');
} else {
  await call('PUT', `/api/governance/virtual-keys/${vk.id}`, { provider_configs: providerConfigs });
  vk = (await call('GET', `/api/governance/virtual-keys/${vk.id}`)).json.virtual_key ?? vk;
  console.log('Updated virtual key proofbench-cascade.');
}
if (!vk?.value) throw new Error('Bifrost did not return the virtual key value.');

// 3. Save the key for the API and scripts.
let env = '';
try {
  env = await readFile('.env', 'utf8');
} catch {
  /* new file */
}
env = env.split('\n').filter(line => !line.startsWith('BIFROST_VIRTUAL_KEY=')).join('\n').replace(/\n*$/, '\n') + `BIFROST_VIRTUAL_KEY=${vk.value}\n`;
await writeFile('.env', env);

// 4. Smoke test through the gateway with the virtual key.
const smoke = await fetch(`${gateway}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-bf-vk': vk.value },
  body: JSON.stringify({ model: DEFAULT_CONFIG.small.model, max_tokens: 8, messages: [{ role: 'user', content: 'Reply with OK.' }] }),
});
console.log(`Smoke test through Bifrost: HTTP ${smoke.status}. BIFROST_VIRTUAL_KEY saved to .env.`);
