// Runs the real OpenCode CLI, unmodified, with its base URL pointed at Cascade, on one race task.
// The ProofBench API must be running (npm run dev). Usage:
//   node --env-file=.env --import tsx scripts/cascade-opencode.ts [taskId] [--direct-large]
// --direct-large pins every call to the large tier (model "cascade:large"): the same path, for comparison.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { findTask, runSandboxedTests } from '../packages/cascade/src/index';

const exec = promisify(execFile);
const args = process.argv.slice(2);
const task = findTask(args.find(a => !a.startsWith('-')) ?? 'calc');
if (!task) throw new Error('Unknown task');
const direct = args.includes('--direct-large');
const api = process.env.PROOFBENCH_API_URL ?? 'http://127.0.0.1:3001';

const root = await mkdtemp(join(tmpdir(), 'pb-opencode-'));
const workspace = join(root, 'repo');
const home = join(root, 'home');
await mkdir(workspace);
await mkdir(home);
await writeFile(join(workspace, task.file), task.source);
await writeFile(join(workspace, task.testFile), task.tests);
const isolated = { PATH: process.env.PATH ?? '', HOME: home, XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, XDG_DATA_HOME: home, XDG_STATE_HOME: home };
await exec('git', ['-c', 'init.templateDir=', 'init', '--quiet'], { cwd: workspace, env: { ...isolated, GIT_CONFIG_NOSYSTEM: '1' } });

const provider = { baseURL: `${api}/api/cascade/v1`, apiKey: 'unused', headers: {}, model: direct ? 'cascade:large' : 'cascade' };

const settings = {
  enabled_providers: ['proofbench'],
  share: 'disabled',
  autoupdate: false,
  permission: {
    '*': 'deny',
    read: { '*': 'allow' },
    edit: { '*': 'deny', [task.file]: 'allow' },
    bash: { '*': 'deny', [`node ${task.testFile}`]: 'allow', [`node --test ${task.testFile}`]: 'allow', 'node --test': 'allow' },
    glob: 'allow',
    grep: 'allow',
  },
  provider: {
    proofbench: {
      npm: '@ai-sdk/openai-compatible',
      options: { baseURL: provider.baseURL, apiKey: provider.apiKey, headers: provider.headers },
      models: { [provider.model]: { name: provider.model, limit: { context: 32768, output: 6000 } } },
    },
  },
};

const started = Date.now();
const prompt = `${task.prompt}\n\nThe tests are in ${task.testFile}. Run them with \`node ${task.testFile}\` after each edit and keep going until they all pass.`;
console.log(`OpenCode → ${direct ? 'Bifrost, large model only' : 'Cascade'} · task ${task.id} · workspace ${workspace}`);
let output = '';
try {
  const run = exec('opencode', ['run', '--standalone', '--format', 'json', '--model', `proofbench/${provider.model}`, prompt], {
    cwd: workspace,
    timeout: 8 * 60_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...isolated, OPENCODE_DISABLE_AUTOCOMPACT: 'true', OPENCODE_DISABLE_LSP_DOWNLOAD: 'true', OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true', OPENCODE_DISABLE_MODELS_FETCH: 'true', OPENCODE_CONFIG_CONTENT: JSON.stringify(settings) },
  });
  // OpenCode waits for piped input while stdin is open.
  run.child.stdin?.end();
  ({ stdout: output } = await run);
} catch (error) {
  output = (error as { stdout?: string }).stdout ?? '';
  console.log(((error as { stderr?: string }).stderr ?? '').split('\n').slice(-15).join('\n'));
  console.log('OpenCode exited with an error:', (error as Error).message.split('\n')[0]);
}

let steps = 0;
let tools = 0;
let input = 0;
let outputTokens = 0;
for (const line of output.split('\n')) {
  try {
    const event = JSON.parse(line);
    if (event.type === 'step_start') steps++;
    if (event.type === 'tool_use') tools++;
    const tokens = event.part?.tokens;
    if (event.type === 'step_finish' && tokens) {
      input += tokens.input ?? 0;
      outputTokens += tokens.output ?? 0;
    }
  } catch {
    /* non-JSON line */
  }
}
const graded = await runSandboxedTests(join(root, 'grade'), { [task.file]: await readFile(join(workspace, task.file), 'utf8'), [task.testFile]: task.tests }, task.testFile);
// Cascade's own per-session usage comes from the provider usage Bifrost returned, so it is the number we report.
const sessions = (await fetch(`${api}/api/cascade/sessions`).then(r => r.json()).catch(() => ({ sessions: [] }))).sessions as Array<{ id: string; client: string; turns: number; escalations: number; usage: Record<string, { input: number; output: number }>; createdAt: string }>;
const mine = sessions.filter(s => /opencode/i.test(s.client) && Date.parse(s.createdAt) >= started - 1000);
const sum = (tier: string, kind: 'input' | 'output') => mine.reduce((n, s) => n + (s.usage[tier]?.[kind] ?? 0), 0);
const result = {
  agent: 'opencode', recordedAt: new Date(started).toISOString(), task: task.id, route: provider.model,
  passed: graded.ok, tests: `${graded.passed}/${graded.passed + graded.failed}`, steps, toolCalls: tools,
  seconds: Math.round((Date.now() - started) / 1000), escalations: mine.reduce((n, s) => n + s.escalations, 0),
  usage: { small: { input: sum('small', 'input'), output: sum('small', 'output') }, large: { input: sum('large', 'input'), output: sum('large', 'output') } },
  opencodeReportedTokens: { input, output: outputTokens },
};
console.log(JSON.stringify(result));
const dir = join(process.env.DATA_DIR ?? '.local/data', 'cascade-opencode');
await mkdir(dir, { recursive: true });
await writeFile(join(dir, `${result.recordedAt.replace(/[:.]/g, '-')}-${task.id}-${direct ? 'large' : 'cascade'}.json`), JSON.stringify(result, null, 1));
