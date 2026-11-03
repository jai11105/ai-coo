// Slice 6 - public facade: single import surface for the orchestrator,
// specialist tools, and tests. Implementation split across small modules
// (a..f) to keep edits reviewable; behavior unchanged from the spec.
export {
  PRIORITY_RANKING_VERSION, MAX_CANDIDATES, MAX_RECOMMENDATIONS, SEVERITY_ORDER,
  isPriorityQuestion, isPriorityFollowup,
  cmpItem, diffOf, pctOf, evidenceIds, strengthFor, hasWarning,
} from "./priorities-a";
export type {
  PrioritySeverity, PriorityKind, ImpactKind, PriorityUrgency, PriorityConfidence,
  PriorityCandidate, PriorityRecommendation,
} from "./priorities-a";
export { salesProfitCandidates, costCandidates } from "./priorities-b";
export { productCandidates, dimensionCandidates } from "./priorities-c";
export { peakGapCandidates, identifyCandidates } from "./priorities-d";
export { rankCandidates, toRecommendations } from "./priorities-e";
export { validateRecommendations, resolvePriorityReference, RANKING_METHODOLOGY_NOTE } from "./priorities-f";
