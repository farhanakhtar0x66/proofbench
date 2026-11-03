# Repeated reporting and corroboration

General evidence comparison now checks for substantial repeated sentences as well as duplicate URLs and whole excerpts. Two hostnames alone do not establish independent reporting. A repeated passage can appear on multiple websites with different introductions or commentary.

Within one comparison, the first excerpt containing a passage remains a candidate; later excerpts sharing it are retained as citations but excluded from corroborating source counts. This is a conservative warning, not a verified determination of which publisher originated the passage. The first occurrence is not automatically authoritative or correct. Existing date, scope and model assessment checks still apply.

The heuristic normalizes Unicode presentation, case and whitespace. It flags repeated whole excerpts of at least 120 characters, or identical complete candidate sentences of at least 160 characters. Short shared factual sentences do not trigger the additional sentence check. The sentence splitter is the existing English claim-candidate helper; this is not a universal plagiarism detector. Paraphrases, translated copies, shared ownership and separate articles about the same interview may still escape detection. Legitimate independent articles quoting the same substantial statement can also be conservatively excluded.

When only one qualifying source remains, comparison returns inconclusive before making an inference request. Three sources can still proceed if the first and third provide distinct qualifying evidence while the second overlaps. All returned excerpts remain unchanged and visible with the eligibility warning in the existing citation `dateReason` field, which already carries duplicate and metadata warnings. No public schema, search count, model budget, paid fallback or actual `.env` setting changes.

Validation uses synthetic sources and model stubs, including repeated passages with distinct surrounding text, normalized copies, short shared facts, distinct reporting, per-comparison isolation, early abstention and a third qualifying source. No live-source quality or broad factual-accuracy improvement is claimed from these tests.

On November 3, 2026, lint and TypeScript passed, all 392 tests passed with `npm test -- --maxWorkers=1`, six offline fixture regressions passed, and the production build passed. The default parallel test run hit six existing API-startup timeouts; the same tests passed with one worker and unchanged time limits. No real API requests were used.
