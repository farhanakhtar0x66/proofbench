/** Claim interpretation, never a truth verdict. Unknown and changing facts keep date gates. */
export const TEMPORAL_POLICY='Classify claimTimeSensitivity as stable only for definitions, expansions of acronyms, established scientific/geographical facts or intrinsic technical properties. Use changing for prices, officeholders, ownership, availability, support, versions, laws, political capitals/borders, statistics or events; uncertain for ambiguous or mixed claims. A stable classification never proves truth or freshness.';
export const temporalValues=['stable','changing','uncertain'] as const;
// Model misclassification cannot waive dates for these explicitly volatile scopes.
export function requiresRecentEvidence(claim:string){
 return /\b(?:current(?:ly)?|latest|today|now|prices?|pricing|costs?|CEO|president|prime minister|PM|captain|chairperson|head coach|owner|owned|owns|ownership|subsidiary|parent company|available|availability|supports?|supported|versions?|releases?|laws?|legal|regulations?|rates?|capitals?|borders?|population|revenue|election|updates?|patches|fixes|yesterday|tomorrow|was|became|took)\b|\b\d{4}\b|[$€£₹]/iu.test(claim);
}
export function ageOnlyDateReason(reason:string){
 return reason.startsWith('The publication date is missing;')||reason.startsWith('The publication is older than 30 days;');
}
