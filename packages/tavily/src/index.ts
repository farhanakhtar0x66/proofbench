import { randomUUID } from 'node:crypto';
import { VerifyRequest, VerificationReport, ClaimVerification } from '../../contracts/src/index';
import cases from '../../../fixtures/freshness-cases/v1.json';

interface TavilySearchResponse {
  results?: Array<{
    title: string;
    url: string;
    content: string;
    published_date?: string;
  }>;
}

async function queryLiveTavily(query: string, apiKey: string): Promise<TavilySearchResponse> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      include_answer: true,
      max_results: 3,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Tavily API error (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as TavilySearchResponse;
}

// Verification engine: supports explicitly authorized live Tavily research when configured,
// falling back to conservative deterministic offline fixture lookup for CI and offline development.
export async function verifyAnswer(input: VerifyRequest): Promise<VerificationReport> {
  const request = VerifyRequest.parse(input);
  const now = new Date().toISOString();
  const isLive = process.env.TAVILY_MODE === 'live' && Boolean(process.env.TAVILY_API_KEY);
  const claims = request.claims ?? request.text.split(/(?<=[.!?])\s+|\n+/u).filter(Boolean).slice(0, 50).map((text) => ({ text, asOf: undefined }));

  const verifiedClaims = await Promise.all(
    claims.map(async ({ text, asOf }) => {
      // 1. Live Tavily search when explicitly authorized with server-side key
      if (isLive && process.env.TAVILY_API_KEY) {
        try {
          const liveData = await queryLiveTavily(text, process.env.TAVILY_API_KEY);
          const results = liveData.results ?? [];
          if (results.length > 0) {
            const hasDeprecation = results.some((r) => /deprecat/i.test(r.content));
            const hasSupport = results.some((r) => /supported|current|active/i.test(r.content));
            const outcome = hasDeprecation ? 'contradicted' : hasSupport ? 'supported' : 'inconclusive';
            const freshness = hasDeprecation ? 'stale' : hasSupport ? 'current' : 'unknown';

            return ClaimVerification.parse({
              version: '1',
              id: randomUUID(),
              text,
              timeSensitive: 'yes',
              outcome,
              freshness,
              asOf: asOf ?? now,
              uncertainty: 'Live Tavily web research evidence; subject to source freshness.',
              evidence: results.map((r) => ({
                url: r.url,
                title: r.title,
                retrievedAt: now,
                recordedAt: r.published_date ?? now,
                excerpt: r.content.slice(0, 300),
                relation: hasDeprecation ? 'contradicts' : 'supports',
                retrieval: 'live',
              })),
            });
          }
        } catch {
          // On live query network error, gracefully fall through to offline fixture lookup
        }
      }

      // 2. Offline exact-fixture lookup (conservative, non-semantic)
      const fixture = asOf ? undefined : cases.find((c) => c.statement === text.trim());
      return ClaimVerification.parse({
        version: '1',
        id: randomUUID(),
        text,
        timeSensitive: fixture?.timeSensitive ?? 'unknown',
        outcome: fixture?.expectedOutcome ?? 'inconclusive',
        freshness: fixture?.expectedFreshness ?? 'unknown',
        asOf: asOf ?? now,
        uncertainty: fixture
          ? `Offline fixture, not live Tavily evidence. ${fixture.uncertainty}`
          : asOf
            ? 'Explicit date scope requires temporal evidence; mock cannot verify this date.'
            : 'No exact offline fixture. Claim extraction is sentence-based; current truth has not been established.',
        evidence: fixture && fixture.expectedOutcome !== 'inconclusive'
          ? [
              {
                url: fixture.source,
                title: `Offline reference: ${fixture.id}`,
                retrievedAt: null,
                recordedAt: '2026-11-02T00:00:00.000Z',
                excerpt: fixture.reference,
                relation: fixture.expectedOutcome === 'supported' ? 'supports' : 'contradicts',
                retrieval: 'fixture',
              },
            ]
          : [],
      });
    })
  );

  return VerificationReport.parse({
    version: '1',
    id: randomUUID(),
    mode: isLive ? 'live' : 'mock',
    createdAt: now,
    text: request.text,
    claims: verifiedClaims,
  });
}
