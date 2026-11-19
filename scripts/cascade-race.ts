// Runs one live Cascade race from the terminal and saves it as evidence.
// Usage: npm run cascade:race -- [taskId ...]
import { BifrostUpstream, CascadeRouter, DEFAULT_CONFIG, RaceManager, type RaceEvent } from '../packages/cascade/src/index';

try {
  process.loadEnvFile?.();
} catch {
  /* optional .env */
}

const upstream = new BifrostUpstream({ gatewayUrl: process.env.BIFROST_GATEWAY_URL ?? 'http://127.0.0.1:8089', virtualKey: process.env.BIFROST_VIRTUAL_KEY });
const router = new CascadeRouter(upstream, DEFAULT_CONFIG);
const races = new RaceManager({ router, upstream, dataDir: process.env.DATA_DIR ?? '.local/data' });
const taskIds = process.argv.slice(2).filter(a => !a.startsWith('-'));
const id = races.start({ taskIds });

await new Promise<void>(resolve => {
  races.subscribe(
    id,
    (event: RaceEvent) => {
      const t = `${(event.t / 1000).toFixed(1).padStart(6)}s`;
      if (event.type === 'attempt-start' && event.decision && event.decision.kind !== 'start' && event.decision.kind !== 'stay')
        console.log(`${t} ${event.lane.padEnd(8)} ${event.taskId.padEnd(10)} ⇢ ${event.decision.kind.toUpperCase()} ${event.decision.reason}${event.decision.compression ? ` [prompt ≈${event.decision.compression.before}→${event.decision.compression.after} tok${event.decision.compression.skipped ? ', ' + event.decision.compression.skipped : ''}]` : ''}`);
      if (event.type === 'attempt')
        console.log(`${t} ${event.lane.padEnd(8)} ${event.taskId.padEnd(10)} #${event.attempt} ${event.tier.padEnd(5)} ${event.ok ? 'PASS' : 'fail'} ${event.passed}/${event.passed + event.failed} tok ${event.usage.input}+${event.usage.output} ${(event.latencyMs / 1000).toFixed(1)}s${event.error ? ' ERR ' + event.error : ''}`);
      if (event.type === 'lane-done') console.log(`${t} ${event.lane.padEnd(8)} DONE`, JSON.stringify(event.totals));
      if (event.type === 'race-done') console.log('saved', event.savedPath);
      if (event.type === 'race-error') console.log('RACE ERROR', event.message);
    },
    resolve,
  );
});
