/**
 * Data model for the branching "talent tree" mind-map.
 *
 * The whole board is a single tree. Every box ("node") descends from one
 * root concept — "Talent goals" — through branches ("edges"). Groups (black),
 * subgroups (white), and sets (bronze) organise the tree; item boxes carry a
 * status colour. Any node can be *pinned* to surface it in the header and
 * focus the view on just that node and its subtree, and any node can be
 * flagged as a *habit* (something done every day) which gives it a distinct
 * border.
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
  /**
   * @deprecated Specializations were removed in favour of one big tree.
   * Retained only so older saves can be migrated.
   */
  specId?: string;
  /** Pinned nodes appear in the header; selecting one focuses its subtree. */
  pinned?: boolean;
  /** Marked as a habit (done every day). Drawn with a distinct border. */
  habit?: boolean;
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
   * (sibling under the same parent).
   */
  kind?: "down" | "side";
};

export type EdgeKind = NonNullable<MapEdge["kind"]>;

export function isSideEdge(e: MapEdge): boolean {
  return e.kind === "side";
}

export type MindMap = {
  version: number;
  /** Title shown in the header banner / on the root node. */
  title: string;
  nodes: MapNode[];
  edges: MapEdge[];
  /**
   * `ROOT_VIEW` shows the whole tree; otherwise the id of the pinned node the
   * view is focused on (that node plus its subtree).
   */
  activeView: string;
  /** Packer generation. Older values get a one-time compact re-layout. */
  layoutVersion?: number;
};

export const STATE_VERSION = 5;

/** Id of the single root concept every node hangs off. */
export const ROOT_ID = "root";
/** Sentinel view showing the entire tree instead of a focused subtree. */
export const ROOT_VIEW = "all";

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
