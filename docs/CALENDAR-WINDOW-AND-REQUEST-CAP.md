# Calendar-window boundary and request allowance

The latest manual ownership check received a successful Groq assessment in approximately one second. Two sources were assessed as supporting the claim, but one publication was just over 30 elapsed days old. Its publication day was nevertheless included in the date-only Tavily query window. The next Rust submission was not assessed: the explicitly configured one-request model allowance was exhausted.

General current searches with a date window now use UTC calendar-day age consistently for publication eligibility, as-of scope dates and the publication-recency score. The policy includes today and the preceding 30 UTC dates, matching the existing date-only query bounds. The oldest included day remains eligible throughout that UTC day and ages out at the next UTC midnight. Publication timestamps later than assessment time remain invalid even when on the same day. Earlier days, missing/invalid dates, update conflicts and future effective dates remain excluded.

Literal searches, legacy verification and historical/support searches without a publication-date window retain their existing rolling-date or historical-event policies. Previously saved source timestamps are never refreshed by this change. Cache policy versions changed to avoid reusing earlier boundary assessments.

The saved Facebook/Meta result was replayed offline with its original retrieved sources and recorded Groq relations. It returned supported after the cutoff correction. This was not a fresh search or new model assessment. The oldest qualifying publication was 30 calendar days old, so its publication-recency score was 0/100; that metric does not represent truth confidence. No claim-specific entity names or answer rules were added.

Request limits were not raised. A cap of one means one model attempt for the API process, including failures. Further new claims are blocked; restarting resets that local counter and is not an account-wide budget control. For more tests, explicitly choose an appropriate allowance while tracking provider usage. No retries, extra API calls, provider changes, credentials or UI changes were part of this fix.
