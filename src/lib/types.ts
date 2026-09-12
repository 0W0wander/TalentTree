/**
 * Data model for the branching "talent tree" mind-map.
 *
 * The board is a single free-form canvas of text boxes ("nodes") connected by
 * branches ("edges"). Groups (black), subgroups (white), and sets (bronze)
 * organise the tree; item boxes carry a status colour.
 */

export type NodeStatus =
  | "neutral" // plain steel
  | "done" // achieved (green)
  | "progress" // used to (blue) — done once, then stopped
  | "goal" // not yet / stretch goal (red)
  | "special"; // stand-out node (purple)

/** Structural role of a box. Groups, subgroups, and sets are labels, not goals. */
export type NodeRole = "item" | "group" | "subgroup" | "set";

export type MapNode = {
  id: string;
  title: string;
  /** Optional supporting line(s) shown beneath the title. */
  note?: string;
  /** Icon preset key or image URL. Empty string = no icon. */
  icon?: string;
  status: NodeStatus;
  role?: NodeRole;
  /** @deprecated Prefer `role: "group"`. Kept so older saves still load. */
  header?: boolean;
  /** Specialization this box belongs to. */
  specId?: string;
  /** World-space position of the box's top-left corner. */
  x: number;
  y: number;
  /** Optional fixed width override (px). */
  w?: number;
};

export type MapEdge = {
  id: string;
  /** Source node id (branch starts here). */
  from: string;
  /** Target node id (branch points here). */
  to: string;
  /**
   * `"down"` (default) is parent → child. `"side"` is a same-level peer
   * (sibling under the same parent, or fellow roots of a spec).
   */
  kind?: "down" | "side";
};

export type EdgeKind = NonNullable<MapEdge["kind"]>;

export function isSideEdge(e: MapEdge): boolean {
  return e.kind === "side";
}

/**
 * `achievement` specs are one-off milestone trees ("reach 50k"). `habit`
 * specs are recurring routines: their subgroups are laid out side by side as
 * their own lanes, each branching straight down.
 */
export type SpecKind = "achievement" | "habit";

/** Which tab strip is showing: achievement trees or habit-subgroup specs. */
export type BoardMode = "goals" | "habits";

export type Spec = {
  id: string;
  name: string;
  /** Icon key or image URL shown on the spec tab. */
  icon: string;
  /** Accent color (hex) for the tab glow / panel. */
  accent: string;
  /** Section this spec lives in. Missing = achievement. */
  kind?: SpecKind;
  /**
   * Panel backdrop: a built-in key (`ember`, `frost`, `forest`, `gold`,
   * `shadow`, `steel`) or any image URL / data URL.
   */
  background?: string;
};

export type MindMap = {
  version: number;
  /** Title shown in the header banner. */
  title: string;
  nodes: MapNode[];
  edges: MapEdge[];
  specs: Spec[];
  /** `"all"` shows every spec; otherwise a spec id. */
  activeSpecId: string;
  /** Goals (achievements) vs Habits tab strip. Missing = goals. */
  boardMode?: BoardMode;
  /** Packer generation. Older values get a one-time compact re-layout. */
  layoutVersion?: number;
};

export const STATE_VERSION = 4;
export const ALL_SPECS = "all";
/** Virtual spec: unfinished achievement (non-habit) goals. */
export const GOALS_VIEW = "goals";
/** Virtual spec: unfinished habit-spec goals, shown in the Habits section. */
export const HABIT_GOALS_VIEW = "habit-goals";
/** Persistent group at the top of All Habits; every habit subgroup hangs off it. */
export const HABIT_HUB_ID = "habit-hub";

export function isGoalsBoard(id: string | undefined): boolean {
  return id === GOALS_VIEW || id === HABIT_GOALS_VIEW;
}

export function isVirtualSpec(id: string | undefined): boolean {
  return id === ALL_SPECS || isGoalsBoard(id);
}

export function isHabitSpec(spec: Spec | undefined | null): boolean {
  return spec?.kind === "habit";
}

export function boardModeOf(map: Pick<MindMap, "boardMode">): BoardMode {
  return map.boardMode === "habits" ? "habits" : "goals";
}

export function specInMode(spec: Spec, mode: BoardMode): boolean {
  return mode === "habits" ? isHabitSpec(spec) : !isHabitSpec(spec);
}

export function roleOf(node: MapNode): NodeRole {
  if (
    node.role === "group" ||
    node.role === "subgroup" ||
    node.role === "set" ||
    node.role === "item"
  ) {
    return node.role;
  }
  if (node.header) return "group";
  return "item";
}

export function isLabel(node: MapNode): boolean {
  const r = roleOf(node);
  return r === "group" || r === "subgroup" || r === "set";
}
