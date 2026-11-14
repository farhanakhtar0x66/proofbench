import { expect, it, vi } from 'vitest';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCode } from '../implementations/bifrost-02/src/track-d/agents';
import { limits } from '../implementations/bifrost-02/src/track-d/gateway';
import type { TrackDReceipt } from '../packages/contracts/src/track-d';

it.runIf(process.env.TRACK_D_TEST_OPENCODE === 'true' && Boolean(process.env.TRACK_D_OPENCODE))(
  'lets the actual OpenCode CLI read and edit main.cpp while denying an external file', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'proofbench-permission-probe-'));
    const outsideFile = join(outside, 'outside.txt');
    await writeFile(outsideFile, 'PROOFBENCH_OUTSIDE_FILE_MUST_STAY_PRIVATE');
    const requests: Record<string, unknown>[] = [];
    const actions = [
      { name: 'read', arguments: { filePath: 'main.cpp' } },
      { name: 'edit', arguments: { filePath: 'main.cpp', oldString: 'int main() {}', newString: 'int main() { return 0; }' } },
      { name: 'read', arguments: { filePath: outsideFile } },
    ];
    let next = 0;
    const complete = async (body: Record<string, unknown>) => {
      requests.push(body);
      const action = Array.isArray(body.tools) && body.tools.length > 0 ? actions[next++] : undefined;
      const delta = action ? { role: 'assistant', tool_calls: [{ index: 0, id: `permission-${next}`, type: 'function',
        function: { name: action.name, arguments: JSON.stringify(action.arguments) } }] }
        : { role: 'assistant', content: 'Done.' };
      const response = { id: 'permission-fixture', model: 'fixture', object: 'chat.completion',
        choices: [{ index: 0, message: delta, finish_reason: action ? 'tool_calls' : 'stop' }] };
      if (!body.stream) return Response.json(response);
      return new Response([
        `data: ${JSON.stringify({ ...response, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }] })}`,
        `data: ${JSON.stringify({ ...response, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: action ? 'tool_calls' : 'stop' }] })}`,
        'data: [DONE]', '',
      ].join('\n\n'), { headers: { 'content-type': 'text/event-stream' } });
    };
    try {
    const result = await openCode({ baseline: '// PROOFBENCH_PERMISSION_PROBE\nint main() {}\n', prompt: 'Read and edit main.cpp.',
      config: { origin: 'http://127.0.0.1:8089', model: 'fixture', key: 'not-used-by-fixture', cli: process.env.TRACK_D_OPENCODE! },
      worker: { kind: 'docker', id: 'not-used-by-fixture' }, meter: { receipts: [], complete },
      signal: AbortSignal.timeout(60_000), trace: () => {},
    });
    const toolMessages = requests.flatMap(request => Array.isArray(request.messages)
      ? request.messages.filter((message: { role?: string }) => message.role === 'tool') : []);
    expect(next).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(toolMessages)).toContain('PROOFBENCH_PERMISSION_PROBE');
    expect(result.source).toContain('int main() { return 0; }');
    expect(JSON.stringify(toolMessages)).not.toContain('PROOFBENCH_OUTSIDE_FILE_MUST_STAY_PRIVATE');
    expect(JSON.stringify(toolMessages)).toContain('prevents you from using this specific tool call');
    } finally {
      await unlink(outsideFile);
      await rmdir(outside);
    }
  }, 75_000,
);

it.runIf(process.env.TRACK_D_TEST_OPENCODE === 'true' && Boolean(process.env.TRACK_D_OPENCODE))(
  'stops CLI retries at the shared call cap and preserves its source artifact', async () => {
    const receipts: TrackDReceipt[] = [];
    let attempts = 0;
    const complete = async (body: Record<string, unknown>) => {
      attempts++;
      if (attempts > limits.modelCalls) {
        receipts.push({ status: 429, model: null, provider: null, requestId: null, input: 0, output: 0,
          costUsd: 0, injected: false, relayRejection: 'model-call-limit' });
        return Response.json({ error: { message: 'Call cap fixture.', type: 'benchmark_gateway_error' } }, { status: 429 });
      }
      receipts.push({ status: 200, model: 'fixture', provider: 'fixture', requestId: `fixture-${attempts}`,
        input: 1, output: 1, costUsd: null, injected: false });
      const useTool = Array.isArray(body.tools) && body.tools.length > 0;
      const delta = useTool ? { role: 'assistant', tool_calls: [{ index: 0, id: `read-${attempts}`, type: 'function',
        function: { name: 'read', arguments: JSON.stringify({ filePath: 'main.cpp', offset: attempts, limit: 1 }) } }] }
        : { role: 'assistant', content: 'Fixture title.' };
      const response = { id: 'cap-fixture', model: 'fixture', choices: [{ index: 0, message: delta, finish_reason: useTool ? 'tool_calls' : 'stop' }] };
      if (!body.stream) return Response.json(response);
      return new Response([
        `data: ${JSON.stringify({ ...response, choices: [{ index: 0, delta, finish_reason: null }] })}`,
        `data: ${JSON.stringify({ ...response, choices: [{ index: 0, delta: {}, finish_reason: useTool ? 'tool_calls' : 'stop' }] })}`,
        'data: [DONE]', '',
      ].join('\n\n'), { headers: { 'content-type': 'text/event-stream' } });
    };
    const baseline = Array.from({ length: 100 }, (_, index) => `int fixture_${index};`).join('\n');
    const trace = vi.fn();
    const result = await openCode({ baseline, prompt: 'Read main.cpp.',
      config: { origin: 'http://127.0.0.1:8089', model: 'fixture', key: 'not-used', cli: process.env.TRACK_D_OPENCODE! },
      worker: { kind: 'docker', id: 'not-used' }, meter: { receipts, complete }, signal: AbortSignal.timeout(60_000), trace,
    });
    expect(result.source).toBe(baseline);
    expect(attempts).toBe(limits.modelCalls + 1);
    expect(trace).toHaveBeenCalledWith('adapter', expect.stringContaining('shared model-call limit'));
  }, 75_000,
);
