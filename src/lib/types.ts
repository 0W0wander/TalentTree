/**
 * Data model for the branching "talent tree" mind-map.
 *
 * The board is a single free-form canvas of text boxes ("nodes") connected by
 * branches ("edges"). Groups (black) and subgroups (white) organise the tree;
 * item boxes carry a status colour.
 */

export type NodeStatus =
  | "neutral" // plain steel
  | "done" // achieved (green)
  | "progress" // in progress (teal)
  | "goal" // not yet / stretch goal (red)
  | "special"; // stand-out node (purple)

/** Structural role of a box. Groups and subgroups are labels, not goals. */
export type NodeRole = "item" | "group" | "subgroup";

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

export type Spec = {
  id: string;
  name: string;
  /** Icon key or image URL shown on the spec tab. */
  icon: string;
  /** Accent color (hex) for the tab glow / panel. */
  accent: string;
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
  /** Packer generation. Older values get a one-time compact re-layout. */
  layoutVersion?: number;
};

export const STATE_VERSION = 4;
export const ALL_SPECS = "all";
/** Virtual spec: unfinished (red) goals plus the box that leads into each. */
export const GOALS_VIEW = "goals";

export function isVirtualSpec(id: string | undefined): boolean {
  return id === ALL_SPECS || id === GOALS_VIEW;
}

export function roleOf(node: MapNode): NodeRole {
  if (node.role === "group" || node.role === "subgroup" || node.role === "item") {
    return node.role;
  }
  if (node.header) return "group";
  return "item";
}

export function isLabel(node: MapNode): boolean {
  const r = roleOf(node);
  return r === "group" || r === "subgroup";
}
