export type Talent = {
  id: string;
  name: string;
  /**
   * Description. You can use "$r" as a placeholder that will be highlighted,
   * and put per-rank values by separating them with " / " if you like.
   */
  description: string;
  /** Icon key from ICON_PRESETS or an arbitrary image URL / data URL. */
  icon: string;
  /** Zero-indexed grid position. */
  row: number;
  col: number;
  maxRank: number;
  /** Optional prerequisite talent id that must be maxed before this unlocks. */
  requires?: string;
  /**
   * Points that must already be spent in THIS tree before the talent unlocks.
   * When omitted it is derived from the row (row * pointsPerTier).
   */
  requiredPoints?: number;
};

export type TalentTree = {
  id: string;
  name: string;
  /** Icon key or image URL shown on the spec tab. */
  icon: string;
  /** Accent color (hex) used for glows / highlights in this tree. */
  accent: string;
  rows: number;
  cols: number;
  talents: Talent[];
};

export type AppState = {
  version: number;
  /** Title shown in the header banner. */
  title: string;
  /** Total talent points the player can spend across all trees. */
  pointsBudget: number;
  /** Points required per tier row to unlock the next tier. */
  pointsPerTier: number;
  activeTreeId: string;
  trees: TalentTree[];
  /** talentId -> current rank invested. */
  ranks: Record<string, number>;
};

export const STATE_VERSION = 1;
