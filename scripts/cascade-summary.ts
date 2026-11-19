// Summarises recorded OpenCode runs (scripts/cascade-opencode.ts) per task and route, and copies them
// into docs/evidence/cascade/opencode so the README numbers trace to files in the repository.
// Usage: node --import tsx scripts/cascade-summary.ts [--since 2026-11-19T17:50:00Z] [--copy]
import { copyFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PRICES } from '../apps/web/src/pricing';

interface Run {
  task: string;
  route: string;
  passed: boolean;
  seconds: number;
  escalations: number;
  recordedAt: string;
  usage: Record<'small' | 'large', { input: number; output: number }>;
}

const args = process.argv.slice(2);
const since = args.includes('--since') ? Date.parse(args[args.indexOf('--since') + 1]) : 0;
const source = join(process.env.DATA_DIR ?? '.local/data', 'cascade-opencode');
const target = 'docs/evidence/cascade/opencode';
const small = PRICES.find(p => p.id === 'gpt-6-luna')!;
const large = PRICES.find(p => p.id === 'claude-sonnet-5-5')!;
const cost = (run: Run) =>
  (run.usage.small.input * small.input + run.usage.small.output * small.output + run.usage.large.input * large.input + run.usage.large.output * large.output) / 1e6;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const files = (await readdir(source)).filter(f => f.endsWith('.json'));
const runs: Array<Run & { file: string }> = [];
for (const file of files) {
  const run = JSON.parse(await readFile(join(source, file), 'utf8')) as Run;
  if (Date.parse(run.recordedAt) >= since) runs.push({ ...run, file });
}
if (args.includes('--copy')) {
  await mkdir(target, { recursive: true });
  for (const run of runs) await copyFile(join(source, run.file), join(target, run.file));
}

const groups = new Map<string, typeof runs>();
for (const run of runs) groups.set(`${run.task}|${run.route}`, [...(groups.get(`${run.task}|${run.route}`) ?? []), run]);
console.log(`Prices: small tier as ${small.label} ($${small.input}/$${small.output} per M), large tier as ${large.label} ($${large.input}/$${large.output} per M)\n`);
console.log('| Task | Route | Runs | Passed | Median cost | Cost range | Median time | Escalations |');
console.log('|---|---|---|---|---|---|---|---|');
for (const [key, group] of [...groups].sort()) {
  const [task, route] = key.split('|');
  const costs = group.map(cost);
  console.log(
    `| ${task} | ${route === 'cascade' ? 'Cascade' : 'Big model only'} | ${group.length} | ${group.filter(r => r.passed).length}/${group.length} | $${median(costs).toFixed(3)} | $${Math.min(...costs).toFixed(3)}–$${Math.max(...costs).toFixed(3)} | ${Math.round(median(group.map(r => r.seconds)))}s | ${group.reduce((n, r) => n + r.escalations, 0)} |`,
  );
}
