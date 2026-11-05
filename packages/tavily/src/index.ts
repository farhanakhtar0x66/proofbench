import { randomUUID } from 'node:crypto';
import { z } from 'zod';
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

const COMMON_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'were', 'which',
  'standard', 'function', 'method', 'module', 'internal', 'document', 'claimed',
  'signal', 'processor', 'during', 'loops', 'wait', 'loop', 'note',
  'currently', 'since', 'also', 'about', 'more', 'when', 'what', 'then', 'there',
  'their', 'only', 'into', 'some', 'such', 'than',
]);

function sanitizeUntrustedText(input: string, maxLength = 300): string {
  if (!input) return '';
  let cleaned = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if ((code >= 32 && code !== 127) || code === 9 || code === 10 || code === 13) {
      cleaned += input[i];
    }
  }
  return cleaned
    .replace(/<[^>]*>/g, '') // strip HTML tags
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function extractKeyEntities(text: string): string[] {
  // Extract path/identifier expressions (e.g. std::sync::atomic::spin_loop_hint or identifiers)
  const codeSymbols = text.match(/[a-zA-Z_][a-zA-Z0-9_]*(?:::[a-zA-Z_][a-zA-Z0-9_]*)+/g) ?? [];
  const words = text.match(/\b[a-zA-Z_][a-zA-Z0-9_]{3,}\b/g) ?? [];
  const candidateWords = words
    .map((w) => w.toLowerCase())
    .filter((w) => !COMMON_STOPWORDS.has(w));
  return Array.from(new Set([...codeSymbols, ...candidateWords]));
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
      max_results: 5,
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
  const configuredMode = process.env.TAVILY_MODE ?? 'mock';

  if (configuredMode === 'live' && !process.env.TAVILY_API_KEY) {
    throw new Error("TAVILY_MODE is configured as 'live', but TAVILY_API_KEY environment variable is not set.");
  }

  const isLive = configuredMode === 'live' && Boolean(process.env.TAVILY_API_KEY);
  const claims = request.claims ?? request.text
    .split(/(?<=[.!?])\s+|\n+/u)
    .filter(Boolean)
    .slice(0, 50)
    .map((text) => ({ text, asOf: undefined }));

  const verifiedClaims = await Promise.all(
    claims.map(async ({ text, asOf }) => {
      // 1. Live Tavily search when explicitly authorized with server-side key
      if (isLive && process.env.TAVILY_API_KEY) {
        try {
          const liveData = await queryLiveTavily(text, process.env.TAVILY_API_KEY);
          const rawResults = liveData.results ?? [];

          if (rawResults.length === 0) {
            return ClaimVerification.parse({
              version: '1',
              id: randomUUID(),
              text,
              timeSensitive: 'unknown',
              outcome: 'inconclusive',
              freshness: 'unknown',
              asOf: asOf ?? now,
              uncertainty: 'Live Tavily web research returned zero results for this query.',
              evidence: [],
            });
          }

          // Sanitize untrusted external inputs and validate URLs
          const sanitizedEvidence = rawResults
            .filter((r) => r.url && z.string().url().safeParse(r.url).success)
            .map((r) => {
              const pubDate = r.published_date && !isNaN(Date.parse(r.published_date))
                ? new Date(r.published_date).toISOString()
                : undefined;
              return {
                url: r.url,
                title: sanitizeUntrustedText(r.title, 150) || 'Web Resource',
                retrievedAt: now,
                recordedAt: pubDate,
                publishedAt: pubDate,
                excerpt: sanitizeUntrustedText(r.content, 400),
              };
            });

          // Evidence-aware claim assessment: check entity match & deprecation vs active support
          const entities = extractKeyEntities(text);
          if (entities.length === 0) {
            return ClaimVerification.parse({
              version: '1',
              id: randomUUID(),
              text,
              timeSensitive: 'unknown',
              outcome: 'inconclusive',
              freshness: 'unknown',
              asOf: asOf ?? now,
              uncertainty: 'Claim contains no specific verifiable entities; returning inconclusive.',
              evidence: [],
            });
          }

          // Require that evidence snippets contain at least one extracted entity
          const relevantSnippets = sanitizedEvidence.filter((e) => {
            const lowerExcerpt = e.excerpt.toLowerCase();
            return entities.some((ent) => lowerExcerpt.includes(ent.toLowerCase()));
          });

          if (relevantSnippets.length === 0) {
            return ClaimVerification.parse({
              version: '1',
              id: randomUUID(),
              text,
              timeSensitive: 'unknown',
              outcome: 'inconclusive',
              freshness: 'unknown',
              asOf: asOf ?? now,
              uncertainty: 'Search results do not contain excerpts directly referencing the claimed entity; returning inconclusive to prevent false verdicts.',
              evidence: sanitizedEvidence.slice(0, 3).map((e) => ({
                url: e.url,
                title: e.title,
                retrievedAt: e.retrievedAt,
                recordedAt: e.recordedAt,
                publishedAt: e.publishedAt,
                excerpt: e.excerpt,
                relation: 'context',
                retrieval: 'tavily',
              })),
            });
          }

          // Analyze claim assertion polarity
          const lowerText = text.toLowerCase();
          const assertsDeprecation = /\b(deprecated|obsolete|sunset|end[- ]of[- ]life|eol|removed|superseded|no longer supported|discontinued)\b/i.test(lowerText);
          const assertsActive = /\b(currently supported|is supported|actively supported|is current|recommended API|standard function|stable in)\b/i.test(lowerText);

          // Analyze explicit evidence in relevant snippets
          const snippetHasDeprecation = relevantSnippets.some((e) =>
            /\b(deprecated since|is deprecated|was deprecated|obsolete|sunset|end[- ]of[- ]life|eol|removed in|superseded by|no longer recommended|discontinued)\b/i.test(e.excerpt)
          );
          const snippetHasActiveSupport = relevantSnippets.some((e) =>
            /\b(actively supported|is supported|supported in|recommended API|standard function in|currently maintained|stable since)\b/i.test(e.excerpt)
          );

          let outcome: 'supported' | 'contradicted' | 'inconclusive' = 'inconclusive';
          let freshness: 'current' | 'stale' | 'unknown' = 'unknown';
          let uncertainty: string;

          if (assertsActive) {
            if (snippetHasDeprecation) {
              outcome = 'contradicted';
              freshness = 'stale';
              uncertainty = 'Live Tavily web evidence indicates the claimed entity or function is deprecated, sunset, or superseded.';
            } else if (snippetHasActiveSupport) {
              outcome = 'supported';
              freshness = 'current';
              uncertainty = 'Live Tavily web evidence confirms active support and validity of the claimed entity.';
            } else {
              outcome = 'inconclusive';
              freshness = 'unknown';
              uncertainty = 'Search evidence mentions the entity but does not explicitly confirm active support or deprecation status; returning inconclusive.';
            }
          } else if (assertsDeprecation) {
            if (snippetHasDeprecation) {
              outcome = 'supported';
              freshness = 'current';
              uncertainty = 'Live Tavily web evidence confirms the claimed entity is deprecated or sunset.';
            } else if (snippetHasActiveSupport) {
              outcome = 'contradicted';
              freshness = 'stale';
              uncertainty = 'Live Tavily web evidence indicates the entity remains actively supported, contradicting the deprecation claim.';
            } else {
              outcome = 'inconclusive';
              freshness = 'unknown';
              uncertainty = 'Search evidence mentions the entity but does not explicitly confirm deprecation status; returning inconclusive.';
            }
          } else {
            outcome = 'inconclusive';
            freshness = 'unknown';
            uncertainty = 'Claim does not state an explicit support or deprecation predicate; returning inconclusive to avoid unwarranted verdicts.';
          }

          return ClaimVerification.parse({
            version: '1',
            id: randomUUID(),
            text,
            timeSensitive: outcome !== 'inconclusive' ? 'yes' : 'unknown',
            outcome,
            freshness,
            asOf: asOf ?? now,
            uncertainty,
            evidence: relevantSnippets.slice(0, 3).map((e) => ({
              url: e.url,
              title: e.title,
              retrievedAt: e.retrievedAt,
              recordedAt: e.recordedAt,
              publishedAt: e.publishedAt,
              excerpt: e.excerpt,
              relation: outcome === 'contradicted' ? 'contradicts' : outcome === 'supported' ? 'supports' : 'context',
              retrieval: 'tavily',
            })),
          });
        } catch (err) {
          // Never silently substitute offline fixtures when live retrieval fails in live mode
          return ClaimVerification.parse({
            version: '1',
            id: randomUUID(),
            text,
            timeSensitive: 'unknown',
            outcome: 'inconclusive',
            freshness: 'unknown',
            asOf: asOf ?? now,
            uncertainty: `Live Tavily search request failed: ${(err as Error).message}. Offline fallback is disabled in live mode.`,
            evidence: [],
          });
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
