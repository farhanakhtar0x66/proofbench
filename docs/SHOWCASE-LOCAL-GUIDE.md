# Presenting the local saved assessments

The website can load saved verification reports through its existing local API. This is useful for a repeatable presentation without consuming another search or inference request. It explicitly labels the result as an earlier assessment and shows source retrieval/assessment times. It must not be presented as a fresh live check.

1. Run `npm run dev` from the project root. Saved `.env` stays in rules/mock mode with zero request caps. This starts the Fastify API and Vite website; Bifrost is unnecessary for loading saved reports.
2. Open the Vite address and select **Freshness verifier**.
3. Expand **Load a saved assessment**, paste a saved ID and click **Load saved assessment**.
4. Inspect the verdict, cited passages, dates and limitations. Loading performs a local `GET /api/analysis/:id`; it submits no analysis/search/model request. Editing the statement clears the saved result rather than applying it to a different assertion.

The existing local checkout has three prepared saved examples. Their IDs and claims are in ignored `.local/showcase-guide.md` and `.local/showcase-continuation/manifest.json`:

- Supported: the actual historical GDPR application date.
- Contradicted: the same assertion with an incorrect year.
- Inconclusive: a pricing claim whose dollar currency is unspecified. This is a deterministic ambiguity guard, not a model comparison.

The historical pair first passed real Gemini comparisons on recorded Tavily bodies and then passed fresh combined API submissions with a separately approved search. The current local manifest selects those fresh API reports. Historical freshness remains unknown and unscored. The [live evidence record](SHOWCASE-VALIDATION.md) distinguishes the original failed four-case run, saved-source continuation and fresh confirmation. Loading any report is still replaying its earlier assessment, not making a new live check.

These report IDs refer to ignored local JSON storage and are not seeded into every checkout. A teammate needs their own saved reports or an authorized transfer of the local public-evidence artifacts. No keys, personal paths or raw source bodies are committed. The generic loader works for any existing report ID; statements are not mapped to hard-coded verdicts.

**Remaining scope:** general live verification across arbitrary topics is still unproven. Current leadership, explicit USD pricing and sports examples have unresolved source/eligibility gaps. Present these as limits, and present the saved historical pair as the actual verified demonstration. The full hackathon project and separate Bifrost challenge are not declared complete by this feature.
