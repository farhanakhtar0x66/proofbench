// Probes how often a model solves each race task in N attempts (used to pick tiers and tasks).
// Usage: node --env-file=.env --import tsx scripts/cascade-probe.ts <model> [attempts] [taskId...]
import { BifrostUpstream, RACE_TASKS, extractCode, runSandboxedTests, summarizeTestOutput, type ChatMessage } from '../packages/cascade/src/index';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [model = 'nvidia/poolside/laguna-xs-2.1', attemptsArg = '3', ...ids] = process.argv.slice(2);
const upstream = new BifrostUpstream({ gatewayUrl: process.env.BIFROST_GATEWAY_URL ?? 'http://127.0.0.1:8089', virtualKey: process.env.BIFROST_VIRTUAL_KEY });
const tasks = ids.length ? RACE_TASKS.filter(t => ids.includes(t.id)) : RACE_TASKS;

await Promise.all(
  tasks.map(async task => {
    const dir = join(tmpdir(), 'pb-probe', model.replace(/\W/g, '_'), task.id);
    const first = await runSandboxedTests(dir, { [task.file]: task.source, [task.testFile]: task.tests }, task.testFile);
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a precise coding agent. Reply with the complete corrected file in a single ```js code block and nothing else.' },
      { role: 'user', content: `Task: ${task.prompt}\n\nFile ${task.file}:\n\`\`\`js\n${task.source}\`\`\`\n\nTests ${task.testFile}:\n\`\`\`js\n${task.tests}\`\`\`\n\nCurrent test output:\n${summarizeTestOutput(first.output)}` },
    ];
    const line: string[] = [];
    let tokens = 0;
    for (let i = 1; i <= Number(attemptsArg); i++) {
      const extra = process.env.PROBE_EXTRA ? JSON.parse(process.env.PROBE_EXTRA) : {};
      const res = await upstream.complete({ model, messages, max_tokens: 6000, temperature: 0, ...extra });
      tokens += res.usage.input + res.usage.output;
      const content = res.body?.choices?.[0]?.message?.content ?? '';
      const code = extractCode(content);
      const check = code ? await runSandboxedTests(dir, { [task.file]: code }, task.testFile) : { ok: false, passed: 0, failed: 1, output: 'no code' };
      line.push(`${check.ok ? 'PASS' : 'fail'}(${check.passed}/${check.passed + check.failed},${(res.latencyMs / 1000).toFixed(0)}s)`);
      if (check.ok) break;
      messages.push({ role: 'assistant', content }, { role: 'user', content: `Tests still fail:\n${summarizeTestOutput(check.output)}\n\nReply with the complete corrected ${task.file}.` });
    }
    console.log(task.id.padEnd(10), line.join(' → '), `${tokens} tok`);
  }),
);
