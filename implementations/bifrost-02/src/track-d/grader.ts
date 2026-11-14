import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify, stripVTControlCharacters } from 'node:util';
import type { TrackDCheck, TrackDSession, TrackDTask } from '../../../../packages/contracts/src/track-d';

const exec = promisify(execFile);
const python = () => process.env.TRACK_D_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
export const oracleRevision = 'hackathon-raptors/speed-demon-2026@3e4004f74de60ffd0670115ab653aa4d4cd3647d';
export const publicSuiteRevision = 'graph-repair-public-v2';
const oracleHash = '342f2f7ccab7c22e30c5dcb34a9958da41387e0171cf8c3283a79439e73fff27';
export const graderImage = process.env.TRACK_D_GRADER_IMAGE ?? 'gcc:15';
export const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

export const trackTasks: Record<TrackDTask, { title: string; issue: string }> = {
  'distance-width': { title: 'Long-distance overflow', issue: 'Long paths wrap or appear unreachable near the maximum edge weight.' },
  'directed-edges': { title: 'Directed reachability', issue: 'Some queries find a path even when the directed graph has no path.' },
};

export function starter(task: TrackDTask, corrected = false) {
  const narrow = !corrected && task === 'distance-width';
  const reverse = !corrected && task === 'directed-edges' ? '        edges[v].emplace_back(u, weight);\n' : '';
  return `#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <functional>
#include <limits>
#include <queue>
#include <string>
#include <utility>
#include <vector>

using Distance = std::uint${narrow ? '32' : '64'}_t;
using Edge = std::pair<int, std::uint32_t>;
using Entry = std::pair<Distance, int>;

int main() {
    const char* input = std::getenv("SD_DATA");
    const char* output = std::getenv("SD_OUT");
    const std::string data = input ? input : "/data";
    const std::string out = output ? output : "/out";
    std::ifstream graph(data + "/graph.txt"), queries(data + "/queries.txt");
    std::ofstream answers(out + "/distances.txt");
    int n, m;
    if (!(graph >> n >> m) || !queries || !answers) return 1;
    std::vector<std::vector<Edge>> edges(n);
    for (int i = 0, u, v; i < m; ++i) {
        std::uint32_t weight;
        graph >> u >> v >> weight;
        edges[u].emplace_back(v, weight);
${reverse}    }
    const auto infinity = std::numeric_limits<Distance>::max();
    for (int s, t; queries >> s >> t;) {
        std::vector<Distance> distances(n, infinity);
        std::priority_queue<Entry, std::vector<Entry>, std::greater<Entry>> pending;
        distances[s] = 0;
        pending.emplace(0, s);
        while (!pending.empty()) {
            auto [d, u] = pending.top();
            pending.pop();
            if (d != distances[u]) continue;
            if (u == t) break;
            for (const auto& [v, weight] : edges[u]) {
                const Distance next = d + weight;
                if (next >= distances[v]) continue;
                distances[v] = next;
                pending.emplace(next, v);
            }
        }
        if (distances[t] == infinity) answers << "-1\\n";
        else answers << distances[t] << '\\n';
    }
}
`;
}

const visibleCase = {
  name: 'Public smoke case',
  graph: '4 4\n0 1 8\n0 1 2\n1 2 0\n0 2 9\n',
  queries: '0 2\n1 2\n3 3\n0 2\n',
};

const publicRegressionCase = {
  name: 'Public directed paths and wide sums',
  graph: '4 2\n0 1 3000000000\n1 2 3000000000\n',
  queries: '0 2\n2 0\n3 0\n3 3\n',
};

const edgeCases = [
  { name: 'Wide path sums', graph: '5 4\n0 1 4294967295\n1 2 4294967295\n2 3 4\n0 4 4294967294\n', queries: '0 1\n0 2\n0 3\n0 4\n4 0\n' },
  { name: 'Directed and unreachable nodes', graph: '7 5\n0 1 10\n1 2 3\n2 3 0\n3 3 1\n6 1 4\n', queries: '0 3\n3 0\n5 5\n1 6\n6 3\n0 3\n' },
];

function generatedCase(seed: number) {
  let state = seed;
  const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
  const edges = Array.from({ length: 30 }, () => `${next() % 11} ${next() % 11} ${next()}`);
  const queries = Array.from({ length: 20 }, () => `${next() % 12} ${next() % 12}`);
  return { name: 'Generated graph', graph: `12 ${edges.length}\n${edges.join('\n')}\n`, queries: `${queries.join('\n')}\n` };
}

type Worker = TrackDSession['worker'];
const wsl = ['-d', 'Ubuntu', '--exec'];
const sandbox = ['bwrap', '--unshare-all', '--die-with-parent', '--new-session',
  '--ro-bind', '/usr', '/usr', '--ro-bind', '/lib', '/lib', '--ro-bind', '/lib64', '/lib64',
  '--symlink', 'usr/bin', '/bin', '--tmpfs', '/tmp', '--proc', '/proc', '--dev', '/dev',
  '--clearenv', '--setenv', 'PATH', '/usr/bin:/bin'];

export async function verifyGrader(): Promise<Worker> {
  const oracle = await readFile(resolve('fixtures/track-d/oracle/d_traverse.py'));
  if (hash(oracle.toString().replace(/\r\n/g, '\n')) !== oracleHash) throw new Error('Pinned Track D oracle hash mismatch.');
  await Promise.all([exec(python(), ['--version'], { timeout: 5000 }), exec('git', ['--version'], { timeout: 5000 })]);
  if (process.env.TRACK_D_WORKER === 'wsl') {
    const { stdout } = await exec('wsl', [...wsl, ...sandbox, '--', '/usr/bin/g++', '--version'], { timeout: 5000 });
    return { kind: 'wsl', id: stdout.split(/\r?\n/)[0] };
  }
  const { stdout } = await exec('docker', ['image', 'inspect', '--format', '{{.Id}}', graderImage], { timeout: 5000 });
  return { kind: 'docker', id: stdout.trim() };
}

const compilerOutputBytes = 4096;
const diagnosticCharacters = 2000;
const runCandidate = [
  'if ! g++ -std=c++20 -O2 -fdiagnostics-color=never -fno-diagnostics-show-caret -fmax-errors=5 /proof/main.cpp -o /tmp/solver > /tmp/build.log 2>&1; then',
  `  head -c ${compilerOutputBytes} /tmp/build.log >&2`,
  '  exit 10',
  'fi',
  'for case in /proof/cases/*; do',
  '  out=$(mktemp -d)',
  '  if SD_DATA="$case" SD_OUT="$out" timeout -k 1s 3s /tmp/solver </dev/null >/dev/null 2>&1 && test ! -L "$out/distances.txt" && test -f "$out/distances.txt" && test "$(wc -c < "$out/distances.txt")" -le 4096; then',
  '    printf "CASE\\n"; base64 -w0 "$out/distances.txt"; printf "\\n"',
  '  else printf "CASE\\nINVALID\\n"; fi',
  'done',
].join('\n');

function buildFailureDetail(stderr: unknown) {
  const summary = 'The submitted C++ source did not compile.';
  if (typeof stderr !== 'string') return summary;
  const diagnostic = stripVTControlCharacters(stderr).replaceAll('/proof/', '').replaceAll('\r\n', '\n')
    .replace(/\p{Cc}/gu, character => character === '\n' || character === '\t' ? character : '').trim();
  if (!diagnostic) return summary;
  return `${summary}\n${diagnostic.slice(0, diagnosticCharacters)}${
    diagnostic.length > diagnosticCharacters ? '\n[Compiler diagnostics truncated.]' : ''
  }`;
}

function describeMismatch(actual: Buffer, expected: Buffer) {
  const got = actual.toString('utf8').split('\n');
  const want = expected.toString('ascii').split('\n');
  const line = want.findIndex((answer, index) => answer !== got[index]);
  if (line < 0) return 'Output has extra bytes after the final answer.';
  const shown = /^-?\d{1,24}$/.test(got[line] ?? '') ? got[line] : 'missing or invalid output';
  return want[line] ? `Answer ${line + 1}: expected ${want[line]}, got ${shown}.`
    : 'Output has extra bytes after the final answer.';
}

export async function gradeTrackD(source: string, worker: Worker, seed?: number): Promise<TrackDCheck[]> {
  const publicCases = [visibleCase, publicRegressionCase];
  const cases = seed === undefined ? publicCases : [...publicCases, ...edgeCases, generatedCase(seed)];
  const root = await mkdtemp(join(tmpdir(), 'proofbench-grade-'));
  const inputs = join(root, 'input');
  const name = `proofbench-grade-${randomUUID()}`;
  try {
    const expected = await Promise.all(cases.map(async (test, index) => {
      const data = join(inputs, 'cases', String(index));
      const out = join(root, `expected-${index}`);
      await mkdir(data, { recursive: true });
      await mkdir(out);
      await writeFile(join(data, 'graph.txt'), test.graph);
      await writeFile(join(data, 'queries.txt'), test.queries);
      await exec(python(), [
        resolve('fixtures/track-d/oracle/d_traverse.py'), '--data', data, '--out', out,
      ], { timeout: 5000 });
      return readFile(join(out, 'distances.txt'));
    }));
    await writeFile(join(inputs, 'main.cpp'), source);
    let stdout: string;
    try {
      const commandOptions = { timeout: 27_000, maxBuffer: 64 * 1024 };
      if (worker.kind === 'wsl') {
        const path = await exec('wsl', [...wsl, 'wslpath', '-a', inputs.replaceAll('\\', '/')], { timeout: 5000 });
        ({ stdout } = await exec('wsl', [...wsl, 'timeout', '-k', '1s', '24s', ...sandbox, '--ro-bind', path.stdout.trim(), '/proof',
          '--chdir', '/tmp', '--', 'prlimit', '--cpu=18', '--as=402653184', '--fsize=8388608', '--nproc=48',
          'sh', '-ec', runCandidate], commandOptions));
      } else ({ stdout } = await exec('docker', [
        'run', '--rm', '--name', name, '--pull=never', '--network=none', '--read-only',
        '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user=65534:65534', '--pids-limit=48',
        '--memory=384m', '--cpus=1', '--tmpfs=/tmp:rw,exec,nosuid,nodev,size=48m',
        '--mount', `type=bind,source=${inputs},target=/proof,readonly`, worker.id,
        'sh', '-ec', runCandidate,
      ], commandOptions));
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (code === 10) return [{ name: 'Build', outcome: 'failed', detail: buildFailureDetail((error as { stderr?: unknown }).stderr) }];
      return [{ name: 'Grader worker', outcome: 'unavailable', detail: 'The restricted worker failed to start or exceeded its process limits.' }];
    }
    const output = stdout.split(/\r?\n/);
    return cases.map((test, index) => {
      const encoded = output[index * 2 + 1];
      const bytes = output[index * 2] === 'CASE' && encoded !== 'INVALID' && encoded !== undefined
        ? Buffer.from(encoded, 'base64') : null;
      const passed = bytes?.equals(expected[index]) ?? false;
      return {
        name: test.name, outcome: passed ? 'passed' : 'failed',
        detail: passed ? `Exact output matched · SHA-256 ${hash(expected[index])}`
          : bytes ? describeMismatch(bytes, expected[index])
            : 'Output missing or invalid, or the solver exceeded its limit.',
      };
    });
  } finally {
    if (worker.kind === 'docker') await exec('docker', ['rm', '-f', name], { timeout: 5000 }).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}
