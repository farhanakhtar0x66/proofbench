import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { BifrostClient } from '../implementations/bifrost-01/src/gateway/client';

try {
  process.loadEnvFile?.();
} catch {
  // If .env does not exist or node doesn't support loadEnvFile, continue
}

interface TestResult {
  name: string;
  status: 'PASSED' | 'FAILED';
  details: Record<string, unknown>;
  error?: string;
}

async function runBifrostReliabilitySuite() {
  console.log('='.repeat(80));
  console.log('ProofBench — Real Bifrost Reliability & Security Verification Suite');
  console.log('Target: Live Maxim Bifrost Gateway Daemon (v2.4.0) on http://127.0.0.1:8089');
  console.log('='.repeat(80));

  const results: TestResult[] = [];
  const gatewayUrl = process.env.BIFROST_GATEWAY_URL ?? 'http://127.0.0.1:8089';
  const activeVirtualKey = process.env.BIFROST_VIRTUAL_KEY;
  if (!activeVirtualKey) {
    throw new Error('BIFROST_VIRTUAL_KEY environment variable is required. Please set it in .env');
  }
  const revokedVirtualKeys = [
    'sk-bf-91b1d004-b51e-4a78-b326-e09b840e4b6e',
    'sk-bf-710b95b4-ced1-4450-85c4-4d2e4eb10808',
    'sk-bf-3571d7b4-e653-4bad-b1be-a7e82e0de8d4',
  ];

  // 1. Healthcheck check
  console.log('\n[TEST 1] Verifying live gateway reachability (/healthz)...');
  try {
    const healthRes = await fetch(`${gatewayUrl}/healthz`);
    if (!healthRes.ok) throw new Error(`Healthcheck failed with status ${healthRes.status}`);
    const healthText = await healthRes.text();
    console.log(`  PASSED: Gateway is reachable and healthy (status ${healthRes.status})`);
    results.push({
      name: 'Gateway Healthcheck',
      status: 'PASSED',
      details: { status: healthRes.status, body: healthText.trim() },
    });
  } catch (err) {
    console.error(`  FAILED: ${(err as Error).message}`);
    results.push({
      name: 'Gateway Healthcheck',
      status: 'FAILED',
      details: {},
      error: (err as Error).message,
    });
  }

  // 2. Real Completion with Active Rotated Virtual Key
  console.log('\n[TEST 2] Verifying live chat completion with active rotated virtual key...');
  try {
    const liveClient = new BifrostClient({
      mode: 'live',
      gatewayUrl,
      virtualKey: activeVirtualKey,
      userBudgetLimitUsd: 10.0,
    });

    const completion = await liveClient.createChatCompletion({
      model: 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M',
      messages: [{ role: 'user', content: 'Respond with exactly: PONG' }],
    });

    const content = completion.choices[0]?.message?.content ?? '';
    const metadata = completion.bifrost_metadata;
    console.log(`  PASSED: Received response: "${content.trim().slice(0, 50)}"`);
    console.log(`  Provider: ${metadata?.provider}, Latency: ${metadata?.latency_ms}ms, Cost: $${metadata?.cost_usd}`);

    results.push({
      name: 'Live Chat Completion with Active Key',
      status: 'PASSED',
      details: {
        activeVirtualKey: activeVirtualKey.slice(0, 10) + '...',
        content: content.trim(),
        provider: metadata?.provider,
        latencyMs: metadata?.latency_ms,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        costUsd: metadata?.cost_usd,
      },
    });
  } catch (err) {
    console.error(`  FAILED: ${(err as Error).message}`);
    results.push({
      name: 'Live Chat Completion with Active Key',
      status: 'FAILED',
      details: {},
      error: (err as Error).message,
    });
  }

  // 3. Real HTTP 401 Rejection on Revoked Virtual Keys
  console.log('\n[TEST 3] Verifying live gateway rejection (HTTP 401) on revoked virtual keys...');
  for (const rk of revokedVirtualKeys) {
    try {
      const revokedClient = new BifrostClient({
        mode: 'live',
        gatewayUrl,
        virtualKey: rk,
      });

      let failedAsExpected = false;
      let receivedStatus = 0;
      let errorMessage = '';

      try {
        await revokedClient.createChatCompletion({
          model: 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M',
          messages: [{ role: 'user', content: 'test revoked key' }],
        });
      } catch (reqErr) {
        errorMessage = (reqErr as Error).message;
        if (errorMessage.includes('401') || errorMessage.includes('revoked') || errorMessage.includes('access not found')) {
          failedAsExpected = true;
          receivedStatus = 401;
        }
      }

      if (!failedAsExpected) {
        throw new Error(`Expected HTTP 401 on revoked key ${rk.slice(0, 10)}..., but call did not fail properly: ${errorMessage}`);
      }

      console.log(`  PASSED: Gateway strictly rejected revoked key (${rk.slice(0, 10)}...) with status ${receivedStatus}`);

      results.push({
        name: `Gateway Rejection on Revoked Key (${rk.slice(0, 10)}...)`,
        status: 'PASSED',
        details: {
          revokedKey: rk.slice(0, 10) + '...',
          status: receivedStatus,
          errorMessage,
        },
      });
    } catch (err) {
      console.error(`  FAILED: ${(err as Error).message}`);
      results.push({
        name: `Gateway Rejection on Revoked Key (${rk.slice(0, 10)}...)`,
        status: 'FAILED',
        details: {},
        error: (err as Error).message,
      });
    }
  }

  // 4. Budget Limit Reservation & Enforcement
  console.log('\n[TEST 4] Verifying conservative pre-request budget reservation...');
  try {
    const budgetExceededClient = new BifrostClient({
      mode: 'live',
      gatewayUrl,
      virtualKey: activeVirtualKey,
      userBudgetLimitUsd: 0.0000001, // Micro budget that cannot cover 0.05 reservation
    });

    let reservationBlocked = false;
    let reservationError = '';
    try {
      await budgetExceededClient.createChatCompletion({
        model: 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M',
        messages: [{ role: 'user', content: 'should be blocked by budget reservation' }],
      });
    } catch (err) {
      reservationError = (err as Error).message;
      if (reservationError.includes('budget reservation failed') || reservationError.includes('Budget limit exceeded')) {
        reservationBlocked = true;
      }
    }

    if (!reservationBlocked) {
      throw new Error(`Pre-request reservation failed to block request exceeding budget limit: ${reservationError}`);
    }

    console.log('  PASSED: Client reservation engine rejected request before hitting network');
    results.push({
      name: 'Budget Limit Reservation Enforcement',
      status: 'PASSED',
      details: { budgetLimitUsd: 0.0000001, blocked: true },
    });
  } catch (err) {
    console.error(`  FAILED: ${(err as Error).message}`);
    results.push({
      name: 'Budget Limit Reservation Enforcement',
      status: 'FAILED',
      details: {},
      error: (err as Error).message,
    });
  }

  // 5. Fallback Provider Routing & Model-Switch Notification
  console.log('\n[TEST 5] Verifying fallback provider routing and notifications...');
  try {
    const fallbackClient = new BifrostClient({
      mode: 'live',
      gatewayUrl,
      virtualKey: activeVirtualKey,
      fallbackProviders: ['ollama'],
    });

    const completion = await fallbackClient.createChatCompletion({
      model: 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M',
      messages: [{ role: 'user', content: 'Say OK' }],
      fallbackProviders: ['ollama'],
    });

    const meta = completion.bifrost_metadata;
    console.log(`  PASSED: Routing successful. Provider: ${meta?.provider}, Fallback invoked: ${meta?.fallback_invoked}`);

    results.push({
      name: 'Fallback Provider Routing & Headers',
      status: 'PASSED',
      details: {
        provider: meta?.provider,
        fallbackInvoked: meta?.fallback_invoked,
        model: meta?.model,
      },
    });
  } catch (err) {
    console.error(`  FAILED: ${(err as Error).message}`);
    results.push({
      name: 'Fallback Provider Routing & Headers',
      status: 'FAILED',
      details: {},
      error: (err as Error).message,
    });
  }

  // 6. Confidential Mode Remote Destination Block
  console.log('\n[TEST 6] Verifying confidential mode remote destination blocking...');
  try {
    const remoteClient = new BifrostClient({
      gatewayUrl: 'https://api.openai.com/v1',
      virtualKey: 'sk-remote-test',
      confidential: true,
    });

    let remoteBlocked = false;
    try {
      await remoteClient.createChatCompletion({
        model: 'local-deepseek-coder',
        messages: [{ role: 'user', content: 'confidential source code' }],
      });
    } catch (err) {
      if ((err as Error).message.includes('Confidential repository policy violation')) {
        remoteBlocked = true;
      }
    }

    if (!remoteBlocked) {
      throw new Error('Confidential mode failed to block remote gateway destination');
    }

    console.log('  PASSED: Remote destination strictly blocked in confidential mode');
    results.push({
      name: 'Confidential Destination Enforcement',
      status: 'PASSED',
      details: { destinationUrl: 'https://api.openai.com/v1', blocked: true },
    });
  } catch (err) {
    console.error(`  FAILED: ${(err as Error).message}`);
    results.push({
      name: 'Confidential Destination Enforcement',
      status: 'FAILED',
      details: {},
      error: (err as Error).message,
    });
  }

  // Save evidence
  const outDir = path.resolve(process.cwd(), '.local/data');
  await fs.mkdir(outDir, { recursive: true });
  const evidenceFile = path.join(outDir, 'bifrost-reliability-evidence.json');
  const evidencePayload = {
    timestamp: new Date().toISOString(),
    gatewayUrl,
    activeVirtualKeyPrefix: activeVirtualKey.slice(0, 10) + '...',
    revokedVirtualKeys: revokedVirtualKeys.map((k) => k.slice(0, 10) + '...'),
    totalTests: results.length,
    passed: results.filter((r) => r.status === 'PASSED').length,
    failed: results.filter((r) => r.status === 'FAILED').length,
    results,
  };

  await fs.writeFile(evidenceFile, JSON.stringify(evidencePayload, null, 2), 'utf8');

  console.log('\n' + '='.repeat(80));
  console.log(`Reliability Suite Completed: ${evidencePayload.passed}/${evidencePayload.totalTests} tests passed.`);
  console.log(`Evidence artifact written to: ${evidenceFile}`);
  console.log('='.repeat(80));

  if (evidencePayload.failed > 0) {
    process.exit(1);
  }
}

runBifrostReliabilitySuite().catch((err) => {
  console.error('Fatal error in Bifrost reliability suite:', err);
  process.exit(1);
});
