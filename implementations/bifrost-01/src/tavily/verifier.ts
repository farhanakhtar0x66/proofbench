import { verifyAnswer } from '../../../../packages/tavily/src/index';
import { GovernancePolicy } from '../governance/policy';

export interface DocumentationVerificationResult {
  allowed: boolean;
  claimsVerified: Array<{
    claimText: string;
    outcome: 'supported' | 'contradicted' | 'inconclusive';
    freshness: 'current' | 'stale' | 'unknown';
    sources: Array<{ title: string; url: string; excerpt: string }>;
  }>;
  injectedContext: string;
  reason?: string;
}

export class TavilyDocumentationVerifier {
  static extractVersionClaims(text: string): string[] {
    const lines = text.split('\n');
    const versionKeywords = ['edition', 'version', 'deprecated', 'supported', 'since', 'requires', 'cargo', 'tokio', 'serde', 'runtime'];
    const claims: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 10) continue;
      const lower = trimmed.toLowerCase();
      if (versionKeywords.some((kw) => lower.includes(kw)) || /\bv?\d+\.\d+/.test(trimmed)) {
        claims.push(trimmed.slice(0, 500));
        if (claims.length >= 5) break;
      }
    }

    return claims;
  }

  static async verifyCodePlanClaims(
    planText: string,
    policy: GovernancePolicy
  ): Promise<DocumentationVerificationResult> {
    // 1. Strict Privacy & Confidentiality Enforcement
    if (policy.confidential) {
      return {
        allowed: false,
        claimsVerified: [],
        injectedContext: '',
        reason: 'Confidential repository mode strictly forbids external Tavily documentation retrieval to prevent IP exfiltration.',
      };
    }

    // 2. Extract potential version-sensitive claims
    const extractedClaims = this.extractVersionClaims(planText);
    if (extractedClaims.length === 0) {
      return {
        allowed: true,
        claimsVerified: [],
        injectedContext: '',
      };
    }

    // 3. Query Mohit's Tavily package
    try {
      const report = await verifyAnswer({
        version: '1',
        text: planText,
        claims: extractedClaims.map((c) => ({ text: c })),
      });

      const claimsVerified = report.claims.map((c) => ({
        claimText: c.text,
        outcome: c.outcome,
        freshness: c.freshness,
        sources: c.evidence.map((e) => ({
          title: e.title,
          url: e.url,
          excerpt: e.excerpt,
        })),
      }));

      // 4. Format verified documentation evidence
      let injectedContext = '## Tavily Documentation Verification Findings\n\n';
      for (const item of claimsVerified) {
        injectedContext += `- Claim: "${item.claimText}"\n`;
        injectedContext += `  Status: **${item.outcome.toUpperCase()}** (Freshness: ${item.freshness})\n`;
        if (item.sources.length > 0) {
          injectedContext += `  Verified Sources:\n`;
          for (const s of item.sources) {
            injectedContext += `    - [${s.title}](${s.url}): "${s.excerpt}"\n`;
          }
        }
      }
      injectedContext += '\n';

      return {
        allowed: true,
        claimsVerified,
        injectedContext,
      };
    } catch (err) {
      return {
        allowed: true,
        claimsVerified: [],
        injectedContext: '',
        reason: `Tavily verification failed: ${(err as Error).message}`,
      };
    }
  }
}
