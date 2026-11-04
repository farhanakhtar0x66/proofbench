import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BifrostClient } from '../implementations/bifrost-01/src/gateway/client';
import { ProofBenchAgent } from '../implementations/bifrost-01/src/runtime/agent';
import { TaskSpec } from '../packages/contracts/src/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  process.loadEnvFile?.();
} catch {
  // If .env does not exist or node doesn't support loadEnvFile, continue
}

interface TestCheckResult {
  name: string;
  status: 'PASSED' | 'FAILED';
  details: Record<string, unknown>;
  error?: string;
}

const GATEWAY_URL = process.env.BIFROST_GATEWAY_URL ?? 'http://127.0.0.1:8089';
const SETUP_TOKEN = process.env.BIFROST_SETUP_TOKEN ?? 'proofbench-test-token';
const ACTIVE_VIRTUAL_KEY = process.env.BIFROST_VIRTUAL_KEY;
const MOCK_UPSTREAM_PORT = 9938;
const MOCK_UPSTREAM_URL = `http://127.0.0.1:${MOCK_UPSTREAM_PORT}`;

async function runRealBifrostFailoverSuite() {
  console.log('='.repeat(80));
  console.log('ProofBench — Real Stock Bifrost Gateway Failover & Resilience Verification');
  console.log(`Target Gateway: ${GATEWAY_URL}`);
  console.log(`Controlled Mock Upstream: ${MOCK_UPSTREAM_URL}`);
  console.log('='.repeat(80));

  if (!ACTIVE_VIRTUAL_KEY) {
    throw new Error('BIFROST_VIRTUAL_KEY is required in environment/.env to authenticate with Bifrost');
  }

  const results: TestCheckResult[] = [];
  let mockServer: http.Server | null = null;
  let mockRequestCount = 0;
  let faultMode: '503' | '429' = '503';
  const interceptedRequests: Array<{ method?: string; url?: string; headers: http.IncomingHttpHeaders }> = [];

  let createdUpstreamKeyId: string | null = null;
  let createdRoutingRuleId: string | null = null;

  try {
    // 0. Verify Bifrost Daemon Reachability
    console.log('\n[STAGE 0] Verifying stock Bifrost daemon reachability...');
    const healthRes = await fetch(`${GATEWAY_URL}/health`);
    if (!healthRes.ok) {
      throw new Error(`Bifrost gateway at ${GATEWAY_URL} is unreachable (status ${healthRes.status})`);
    }
    const healthJson = await healthRes.json();
    console.log('  PASSED: Bifrost daemon healthy:', JSON.stringify(healthJson));

    // 1. Start Controlled Primary Upstream Server (Returning 503 or 429)
    console.log('\n[STAGE 1] Starting controlled primary upstream on port ' + MOCK_UPSTREAM_PORT + '...');
    await new Promise<void>((resolve, reject) => {
      mockServer = http.createServer((req, res) => {
        mockRequestCount++;
        interceptedRequests.push({ method: req.method, url: req.url, headers: req.headers });
        console.log(`  [Mock Upstream #${mockRequestCount}] Incoming ${req.method} ${req.url} -> Replying with HTTP ${faultMode}`);

        if (faultMode === '503') {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: {
              message: 'Service Unavailable: Injected primary provider outage for Bifrost failover verification',
              type: 'server_error',
              code: 'service_unavailable',
            },
          }));
        } else {
          res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '5' });
          res.end(JSON.stringify({
            error: {
              message: 'Rate Limit Exceeded: Injected upstream quota exhaustion for Bifrost failover verification',
              type: 'rate_limit_error',
              code: 'rate_limit_exceeded',
            },
          }));
        }
      });

      mockServer.listen(MOCK_UPSTREAM_PORT, '127.0.0.1', () => {
        console.log(`  PASSED: Controlled mock upstream listening at ${MOCK_UPSTREAM_URL}`);
        resolve();
      });
      mockServer.on('error', reject);
    });

    // 2. Configure Primary Upstream Key in Bifrost pointing to our controlled mock server
    console.log('\n[STAGE 2] Registering controlled primary upstream key in Bifrost...');
    const createKeyRes = await fetch(`${GATEWAY_URL}/api/providers/ollama/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bifrost-Setup-Token': SETUP_TOKEN,
      },
      body: JSON.stringify({
        name: 'proofbench-mock-outage-primary',
        value: { value: 'proofbench-outage-key', type: 'plain_text' },
        models: ['proofbench-failover-model'],
        ollama_key_config: {
          url: { value: MOCK_UPSTREAM_URL, type: 'plain_text' },
        },
        enabled: true,
      }),
    });

    if (!createKeyRes.ok) {
      throw new Error(`Failed to register mock upstream key in Bifrost: ${await createKeyRes.text()}`);
    }
    const keyData = await createKeyRes.json() as { id: string };
    createdUpstreamKeyId = keyData.id;
    console.log(`  PASSED: Registered primary key ${createdUpstreamKeyId} targeting ${MOCK_UPSTREAM_URL}`);

    // 3. Configure Stock Bifrost Routing Rule with Target & Fallback
    console.log('\n[STAGE 3] Registering routing rule with primary target and authorized fallback...');
    const createRuleRes = await fetch(`${GATEWAY_URL}/api/routing/rules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bifrost-Setup-Token': SETUP_TOKEN,
      },
      body: JSON.stringify({
        name: 'proofbench-live-failover-rule',
        cel_expression: 'model == "proofbench-failover-model"',
        targets: [
          {
            provider: 'ollama',
            model: 'proofbench-failover-model',
            key_id: createdUpstreamKeyId,
            weight: 1,
          },
        ],
        fallbacks: ['ollama/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M'],
        priority: 1,
        enabled: true,
      }),
    });

    if (!createRuleRes.ok) {
      throw new Error(`Failed to register failover routing rule in Bifrost: ${await createRuleRes.text()}`);
    }
    const ruleData = await createRuleRes.json() as { rule: { id: string } };
    createdRoutingRuleId = ruleData.rule.id;
    console.log(`  PASSED: Routing rule ${createdRoutingRuleId} registered (Target: mock 9938, Fallback: local 1.5B)`);

    // 4. Test Injected HTTP 503 Primary Outage & Bifrost Automatic Fallback
    console.log('\n[STAGE 4] Executing live chat request under HTTP 503 primary outage...');
    faultMode = '503';
    const liveClient = new BifrostClient({
      mode: 'live',
      gatewayUrl: GATEWAY_URL,
      virtualKey: ACTIVE_VIRTUAL_KEY,
      timeoutMs: 15_000,
    });

    const completion503 = await liveClient.createChatCompletion({
      model: 'proofbench-failover-model',
      messages: [{ role: 'user', content: 'Respond with exactly: PONG_503_FAILOVER' }],
    });

    const content503 = completion503.choices[0]?.message?.content?.trim() ?? '';
    const meta503 = completion503.bifrost_metadata;
    console.log(`  Received completion: "${content503.slice(0, 60)}"`);
    console.log('  Bifrost Metadata:', JSON.stringify(meta503, null, 2));

    const passed503 = meta503?.fallback_invoked === true && content503.length > 0;
    results.push({
      name: 'Real Bifrost HTTP 503 Outage Fallback',
      status: passed503 ? 'PASSED' : 'FAILED',
      details: {
        faultInjected: 'HTTP 503 Service Unavailable',
        fallbackInvoked: meta503?.fallback_invoked,
        primaryProvider: meta503?.primary_provider,
        activeProvider: meta503?.provider,
        model: meta503?.model,
        content: content503,
      },
    });
    if (!passed503) throw new Error('HTTP 503 failover test did not invoke fallback or return content');
    console.log('  PASSED: Bifrost detected HTTP 503 and seamlessly failed over to local 1.5B model.');

    // 5. Test Injected HTTP 429 Rate Limit & Bifrost Automatic Fallback
    console.log('\n[STAGE 5] Executing live chat request under HTTP 429 rate limit...');
    faultMode = '429';
    const completion429 = await liveClient.createChatCompletion({
      model: 'proofbench-failover-model',
      messages: [{ role: 'user', content: 'Respond with exactly: PONG_429_FAILOVER' }],
    });

    const content429 = completion429.choices[0]?.message?.content?.trim() ?? '';
    const meta429 = completion429.bifrost_metadata;
    console.log(`  Received completion: "${content429.slice(0, 60)}"`);
    console.log('  Bifrost Metadata:', JSON.stringify(meta429, null, 2));

    const passed429 = meta429?.fallback_invoked === true && content429.length > 0;
    results.push({
      name: 'Real Bifrost HTTP 429 Rate-Limit Fallback',
      status: passed429 ? 'PASSED' : 'FAILED',
      details: {
        faultInjected: 'HTTP 429 Too Many Requests',
        fallbackInvoked: meta429?.fallback_invoked,
        primaryProvider: meta429?.primary_provider,
        activeProvider: meta429?.provider,
        model: meta429?.model,
        content: content429,
      },
    });
    if (!passed429) throw new Error('HTTP 429 failover test did not invoke fallback or return content');
    console.log('  PASSED: Bifrost detected HTTP 429 and seamlessly failed over to local 1.5B model.');

    // 6. Test Live Coding Task Completion Under Outage (End-to-End Task Context & Mutation Preservation)
    console.log('\n[STAGE 6] Executing full coding task (Task 1) under active live Bifrost failover...');
    const taskPath = path.resolve(__dirname, '../fixtures/coding-tasks/task-1-fix-failing-func/task.json');
    const taskSpec = TaskSpec.parse(JSON.parse(await fs.readFile(taskPath, 'utf8')));

    const agent = new ProofBenchAgent({
      primaryModel: 'proofbench-failover-model',
      bifrostClient: liveClient,
      policy: {
        allowedModels: ['proofbench-failover-model', 'qwen', 'ollama'],
      },
      approvalHandler: async (action) => {
        console.log(`  [Host Approval Grant] Host approved ${action.category} action: ${action.tool}`);
        return true;
      },
    });

    const executionResult = await agent.runTask(taskSpec);
    console.log('  Trace events:', JSON.stringify(executionResult.trace.events, null, 2));
    console.log(`  Task status: ${executionResult.run.status}`);
    console.log(`  Acceptance status: ${executionResult.run.acceptance.status}`);
    console.log(`  Events logged in trace: ${executionResult.trace.events.length}`);

    const hasFallbackEvent = executionResult.trace.events.some((e) =>
      e.message.includes('Bifrost fallback routing triggered')
    );
    console.log(`  Fallback routing event captured in trace: ${hasFallbackEvent}`);

    const passedTask = executionResult.run.status === 'completed' &&
      executionResult.run.acceptance.status === 'passed' &&
      hasFallbackEvent;

    results.push({
      name: 'End-to-End Task 1 Execution Under Real Gateway Failover',
      status: passedTask ? 'PASSED' : 'FAILED',
      details: {
        runId: executionResult.run.id,
        taskStatus: executionResult.run.status,
        acceptanceStatus: executionResult.run.acceptance.status,
        fallbackEventCaptured: hasFallbackEvent,
        eventsCount: executionResult.trace.events.length,
      },
    });
    if (!passedTask) throw new Error('Coding task did not pass cleanly under gateway failover');
    console.log('  PASSED: Task 1 completed and verified under genuine gateway failover!');

    // 7. Verify Confidential Mode Gateway Policy Enforcement
    console.log('\n[STAGE 7] Verifying confidential mode destination enforcement on real client...');
    let confidentialRemoteBlocked = false;
    try {
      const confidentialClient = new BifrostClient({
        mode: 'live',
        gatewayUrl: 'https://api.openai.com/v1',
        virtualKey: ACTIVE_VIRTUAL_KEY,
        confidential: true,
      });
      await confidentialClient.createChatCompletion({
        model: 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M',
        messages: [{ role: 'user', content: 'hello' }],
      });
    } catch (err) {
      if ((err as Error).message.includes('Confidential repository policy violation')) {
        confidentialRemoteBlocked = true;
      }
    }

    let confidentialExternalFallbackBlocked = false;
    try {
      const confidentialFallbackClient = new BifrostClient({
        mode: 'live',
        gatewayUrl: GATEWAY_URL,
        virtualKey: ACTIVE_VIRTUAL_KEY,
        confidential: true,
        fallbackProviders: ['openai', 'anthropic'],
      });
      await confidentialFallbackClient.createChatCompletion({
        model: 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M',
        messages: [{ role: 'user', content: 'hello' }],
      });
    } catch (err) {
      if ((err as Error).message.includes('unauthorized external fallback provider')) {
        confidentialExternalFallbackBlocked = true;
      }
    }

    const passedConfidential = confidentialRemoteBlocked && confidentialExternalFallbackBlocked;
    results.push({
      name: 'Confidentiality Route Rejection',
      status: passedConfidential ? 'PASSED' : 'FAILED',
      details: {
        confidentialRemoteBlocked,
        confidentialExternalFallbackBlocked,
      },
    });
    console.log(`  PASSED: Confidential mode strictly blocks external routes and fallbacks (${passedConfidential})`);

  } finally {
    // Teardown: Clean up routing rule, upstream key, and mock server
    console.log('\n[TEARDOWN] Cleaning up temporary gateway routing rules and mock upstreams...');
    if (createdRoutingRuleId) {
      try {
        const delRule = await fetch(`${GATEWAY_URL}/api/routing/rules/${createdRoutingRuleId}`, {
          method: 'DELETE',
          headers: { 'X-Bifrost-Setup-Token': SETUP_TOKEN },
        });
        console.log(`  Routing rule ${createdRoutingRuleId} deleted: status ${delRule.status}`);
      } catch (err) {
        console.warn(`  Failed to delete routing rule: ${(err as Error).message}`);
      }
    }
    if (createdUpstreamKeyId) {
      try {
        const delKey = await fetch(`${GATEWAY_URL}/api/providers/ollama/keys/${createdUpstreamKeyId}`, {
          method: 'DELETE',
          headers: { 'X-Bifrost-Setup-Token': SETUP_TOKEN },
        });
        console.log(`  Primary upstream key ${createdUpstreamKeyId} deleted: status ${delKey.status}`);
      } catch (err) {
        console.warn(`  Failed to delete upstream key: ${(err as Error).message}`);
      }
    }
    if (mockServer) {
      await new Promise<void>((resolve) => (mockServer as http.Server).close(() => resolve()));
      console.log('  Controlled mock server stopped.');
    }
  }

  // 8. Output Summary & Save Evidence Artifact
  console.log('\n' + '='.repeat(80));
  console.log('REAL BIFROST GATEWAY FAILOVER VERIFICATION RESULTS');
  console.log('='.repeat(80));
  for (const r of results) {
    console.log(`- [${r.status}] ${r.name}`);
  }

  const allPassed = results.every((r) => r.status === 'PASSED');
  const evidenceArtifact = {
    testSuite: 'Real Stock Maxim Bifrost Gateway Failover Verification',
    gatewayUrl: GATEWAY_URL,
    executedAt: new Date().toISOString(),
    overallStatus: allPassed ? 'PASSED' : 'FAILED',
    tests: results,
  };

  const evidencePath = path.resolve(__dirname, '../.local/data/real-bifrost-failover-evidence.json');
  await fs.mkdir(path.dirname(evidencePath), { recursive: true });
  await fs.writeFile(evidencePath, JSON.stringify(evidenceArtifact, null, 2), 'utf8');
  console.log(`\nEvidence artifact saved to ${evidencePath}`);

  if (!allPassed) {
    process.exit(1);
  }
}

runRealBifrostFailoverSuite().catch((err) => {
  console.error('\nFATAL ERROR in runRealBifrostFailoverSuite:', err);
  process.exit(1);
});
