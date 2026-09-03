import type { AppState, Talent, TalentTree } from "./types";

export function rankOf(state: AppState, talentId: string): number {
  return state.ranks[talentId] ?? 0;
}

/** Points spent in a single tree. */
export function pointsInTree(state: AppState, tree: TalentTree): number {
  return tree.talents.reduce((sum, t) => sum + rankOf(state, t.id), 0);
}

/** Points spent across all trees. */
export function totalPointsSpent(state: AppState): number {
  return state.trees.reduce((sum, tree) => sum + pointsInTree(state, tree), 0);
}

/** Points required in the tree before a talent may be learned. */
export function requiredPointsFor(state: AppState, talent: Talent): number {
  if (typeof talent.requiredPoints === "number") return talent.requiredPoints;
  return talent.row * state.pointsPerTier;
}

export type TalentStatus =
  | "maxed"
  | "available"
  | "partial"
  | "locked-tier"
  | "locked-prereq"
  | "locked-budget";

export function statusOf(
  state: AppState,
  tree: TalentTree,
  talent: Talent
): TalentStatus {
  const rank = rankOf(state, talent.id);
  if (rank >= talent.maxRank) return "maxed";

  const tierMet = pointsInTree(state, tree) >= requiredPointsFor(state, talent);
  const prereqMet =
    !talent.requires ||
    rankOf(state, talent.requires) >=
      (tree.talents.find((t) => t.id === talent.requires)?.maxRank ?? 1);

  if (rank > 0) {
    // Already partially learned -> always shows as partial (can add if allowed).
    return "partial";
  }
  if (!tierMet) return "locked-tier";
  if (!prereqMet) return "locked-prereq";
  return "available";
}

export function canAddPoint(
  state: AppState,
  tree: TalentTree,
  talent: Talent
): boolean {
  if (rankOf(state, talent.id) >= talent.maxRank) return false;
  if (totalPointsSpent(state) >= state.pointsBudget) return false;
  if (pointsInTree(state, tree) < requiredPointsFor(state, talent)) return false;
  if (talent.requires) {
    const prereq = tree.talents.find((t) => t.id === talent.requires);
    if (prereq && rankOf(state, prereq.id) < prereq.maxRank) return false;
  }
  return true;
}

/**
 * Removing a point is blocked if it would strand talents that depend on the
 * points currently invested (either as a prerequisite or via tier gating).
 */
export function canRemovePoint(
  state: AppState,
  tree: TalentTree,
  talent: Talent
): boolean {
  const rank = rankOf(state, talent.id);
  if (rank <= 0) return false;

  // Simulate the removal and ensure the tree stays valid.
  const simulated: AppState = {
    ...state,
    ranks: { ...state.ranks, [talent.id]: rank - 1 },
  };

  const spentAfter = pointsInTree(simulated, tree);

  for (const other of tree.talents) {
    const otherRank = rankOf(simulated, other.id);
    if (otherRank <= 0) continue;

    // Tier requirement would be violated.
    if (spentAfter < requiredPointsFor(simulated, other)) return false;

    // Prerequisite requirement would be violated.
    if (other.requires === talent.id && rank - 1 < talent.maxRank) return false;
  }
  return true;
}
