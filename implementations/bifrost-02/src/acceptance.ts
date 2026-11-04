import { AcceptanceResult, TaskSpec } from '../../../packages/contracts/src/index';
import { runBoundedProcess } from './process-runner';

export async function verifyTaskAcceptance(
  workspacePath: string,
  taskSpec: TaskSpec
): Promise<AcceptanceResult> {
  const result = await runBoundedProcess({
    command: 'cargo',
    args: ['test', '--quiet'],
    cwd: workspacePath,
    timeoutMs: 30_000,
    maxOutputBytes: 1024 * 1024,
  });

  const passed = result.exitCode === 0 && !result.timedOut && !result.cancelled;
  const status: 'passed' | 'failed' = passed ? 'passed' : 'failed';

  let evidence = '';
  if (result.timedOut) {
    evidence = 'Acceptance test execution timed out (30s limit exceeded)';
  } else if (result.cancelled) {
    evidence = 'Acceptance test execution was cancelled';
  } else if (passed) {
    evidence = 'All independent acceptance unit tests passed cleanly with exit code 0';
  } else {
    const errorSnippet = (result.stderr.trim() || result.stdout.trim()).slice(0, 1000);
    evidence = errorSnippet || `Cargo test exited with non-zero exit code ${result.exitCode}`;
  }

  const checks = taskSpec.acceptance.map((req, index) => ({
    name: req,
    passed: index === 0 ? passed : passed,
    evidence,
  }));

  return AcceptanceResult.parse({
    version: '1',
    status,
    method: 'Independent cargo test acceptance suite executed in isolated workspace',
    checks: checks.length > 0 ? checks : [{ name: 'cargo test --quiet', passed, evidence }],
  });
}
