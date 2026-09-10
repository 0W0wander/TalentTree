import type { MapEdge, MapNode, MindMap, Spec } from "./types";
import {
  ALL_SPECS,
  GOALS_VIEW,
  HABIT_GOALS_VIEW,
  isGoalsBoard,
  isHabitSpec,
  isLabel,
  isSideEdge,
  roleOf,
} from "./types";
import { ACCENT_PRESETS, ICON_PRESETS, newId } from "./presets";
import { organizeGoalsView } from "./layout";

function parentOf(nodes: MapNode[], edges: MapEdge[]) {
  const ids = new Set(nodes.map((n) => n.id));
  const parent = new Map<string, string>();
  for (const e of edges) {
    if (isSideEdge(e)) continue;
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
    if (!parent.has(e.to)) parent.set(e.to, e.from);
  }
  return parent;
}

function rootId(id: string, parent: Map<string, string>) {
  let cur = id;
  const seen = new Set<string>();
  while (parent.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = parent.get(cur)!;
  }
  return cur;
}

/** Make sure a map has spec records and every node belongs to one. */
export function ensureSpecs(map: MindMap): MindMap {
  if (Array.isArray(map.specs) && map.specs.length > 0) {
    const ids = new Set(map.specs.map((s) => s.id));
    const fallback = map.specs[0].id;
    const active =
      isGoalsBoard(map.activeSpecId) ||
      map.activeSpecId === ALL_SPECS ||
      ids.has(map.activeSpecId)
        ? map.activeSpecId
        : ALL_SPECS;
    return {
      ...map,
      specs: map.specs,
      activeSpecId: active,
      nodes: map.nodes.map((n) => ({
        ...n,
        specId: n.specId && ids.has(n.specId) ? n.specId : fallback,
      })),
    };
  }

  const parent = parentOf(map.nodes, map.edges);
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const rootIds = [
    ...new Set(map.nodes.map((n) => rootId(n.id, parent))),
  ];
  const specs: Spec[] = rootIds.map((rid, i) => {
    const node = byId.get(rid);
    return {
      id: newId("spec"),
      name: node?.title || `Spec ${i + 1}`,
      icon: ICON_PRESETS[i % ICON_PRESETS.length].key,
      accent: ACCENT_PRESETS[i % ACCENT_PRESETS.length],
    };
  });
  const rootToSpec = new Map(rootIds.map((rid, i) => [rid, specs[i].id]));
  const nodes = map.nodes.map((n) => ({
    ...n,
    specId: rootToSpec.get(rootId(n.id, parent)) ?? specs[0]?.id,
  }));

  if (specs.length === 0) {
    const spec: Spec = {
      id: newId("spec"),
      name: "Core",
      icon: "sword",
      accent: ACCENT_PRESETS[0],
    };
    return {
      ...map,
      specs: [spec],
      activeSpecId: ALL_SPECS,
      nodes: nodes.map((n) => ({ ...n, specId: spec.id })),
    };
  }

  return { ...map, specs, activeSpecId: ALL_SPECS, nodes };
}

export function nodesInSpec(map: MindMap, specId: string): MapNode[] {
  if (specId === ALL_SPECS) return map.nodes;
  return map.nodes.filter((n) => n.specId === specId);
}

export function specProgress(map: MindMap, specId: string) {
  let done = 0;
  let total = 0;
  for (const n of nodesInSpec(map, specId)) {
    if (isLabel(n)) continue;
    total += 1;
    if (n.status === "done") done += 1;
  }
  return { done, total };
}

/** `startId` plus every box downstream of it. */
export function subtreeIds(startId: string, edges: MapEdge[]): Set<string> {
  const kids = new Map<string, string[]>();
  for (const e of edges) {
    if (isSideEdge(e)) continue;
    const list = kids.get(e.from);
    if (list) list.push(e.to);
    else kids.set(e.from, [e.to]);
  }
  const ids = new Set<string>();
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop()!;
    if (ids.has(id)) continue;
    ids.add(id);
    for (const c of kids.get(id) ?? []) stack.push(c);
  }
  return ids;
}

/** Graft a box (and its children) onto another specialization. */
export function moveSubtreeToSpec(
  map: MindMap,
  startId: string,
  specId: string
): MindMap {
  const ids = subtreeIds(startId, map.edges);
  return {
    ...map,
    nodes: map.nodes.map((n) => (ids.has(n.id) ? { ...n, specId } : n)),
  };
}

/**
 * Link two boxes as peers: same parent (or both roots) and same spec.
 * Does not create a parent → child branch between them.
 */
export function connectAsPeers(
  map: MindMap,
  from: string,
  to: string
): MindMap {
  if (from === to) return map;
  const source = map.nodes.find((n) => n.id === from);
  const target = map.nodes.find((n) => n.id === to);
  if (!source || !target) return map;

  const down = map.edges.filter((e) => !isSideEdge(e));
  if (subtreeIds(from, down).has(to) || subtreeIds(to, down).has(from)) {
    return map;
  }

  let next = map;
  if (source.specId) next = moveSubtreeToSpec(next, to, source.specId);

  const parentFrom = down.find((e) => e.to === from)?.from;
  let edges = next.edges;
  if (parentFrom && parentFrom !== to) {
    edges = edges.filter((e) => isSideEdge(e) || e.to !== to);
    if (
      !edges.some(
        (e) => !isSideEdge(e) && e.from === parentFrom && e.to === to
      )
    ) {
      edges = [
        ...edges,
        { id: newId("e"), from: parentFrom, to, kind: "down" },
      ];
    }
  } else if (!parentFrom) {
    edges = edges.filter((e) => isSideEdge(e) || e.to !== to);
  }

  const dup = edges.some(
    (e) =>
      isSideEdge(e) &&
      ((e.from === from && e.to === to) || (e.from === to && e.to === from))
  );
  if (!dup) {
    edges = [...edges, { id: newId("e"), from, to, kind: "side" }];
  }

  return { ...next, edges };
}

export const GOALS_SPEC: Spec = {
  id: GOALS_VIEW,
  name: "Goals",
  icon: "fire",
  accent: "#ff5a52",
  background: "ember",
};

export const HABIT_GOALS_SPEC: Spec = {
  id: HABIT_GOALS_VIEW,
  name: "Habit Goals",
  icon: "lightning",
  accent: "#5fc84a",
  background: "forest",
  kind: "habit",
};

export type GoalsKindFilter = "all" | "achievement" | "habit";

function habitSpecIdSet(map: MindMap): Set<string> {
  return new Set(
    (map.specs ?? []).filter((s) => isHabitSpec(s)).map((s) => s.id)
  );
}

function matchesGoalFilter(
  node: MapNode,
  habitIds: Set<string>,
  filter: GoalsKindFilter
): boolean {
  if (filter === "all") return true;
  const isHabit = !!node.specId && habitIds.has(node.specId);
  return filter === "habit" ? isHabit : !isHabit;
}

/** Cloned section headers on the Goals board: `gv-p:{sectionId}::{goalId}`. */
export const GOALS_PARENT_CLONE = "gv-p:";

export function goalsViewSourceId(id: string): string {
  if (!id.startsWith(GOALS_PARENT_CLONE)) return id;
  const rest = id.slice(GOALS_PARENT_CLONE.length);
  const sep = rest.indexOf("::");
  return sep >= 0 ? rest.slice(0, sep) : rest;
}

/** Nearest set, then subgroup, then group, walking up. */
function nearestSection(
  id: string,
  parent: Map<string, string>,
  byId: Map<string, MapNode>
): MapNode | undefined {
  let cur = parent.get(id);
  const seen = new Set<string>();
  let subgroup: MapNode | undefined;
  let group: MapNode | undefined;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const n = byId.get(cur);
    if (!n) break;
    const role = roleOf(n);
    if (role === "set") return n;
    if (role === "subgroup" && !subgroup) subgroup = n;
    if (role === "group" && !group) group = n;
    cur = parent.get(cur);
  }
  return subgroup ?? group;
}

export function unfinishedGoalCount(
  map: MindMap,
  filter: GoalsKindFilter = "all"
): number {
  const habitIds = habitSpecIdSet(map);
  let n = 0;
  for (const node of map.nodes) {
    if (isLabel(node) || node.status !== "goal") continue;
    if (!matchesGoalFilter(node, habitIds, filter)) continue;
    n += 1;
  }
  return n;
}

/**
 * Derived board: each unfinished goal under the nearest set, subgroup, or
 * group. Copies only — never writes back onto the saved tree. Section
 * headers are drawn as subgroups on this page so the row matches.
 *
 * `filter` splits achievement goals from habit-spec goals so the two
 * boards can sit in their own tab sections.
 */
export function buildGoalsView(
  map: MindMap,
  maxRowW = 1760,
  filter: GoalsKindFilter = "all"
): {
  nodes: MapNode[];
  edges: MapEdge[];
} {
  const parent = parentOf(map.nodes, map.edges);
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const specRank = new Map((map.specs ?? []).map((s, i) => [s.id, i]));
  const habitIds = habitSpecIdSet(map);
  const viewId = filter === "habit" ? HABIT_GOALS_VIEW : GOALS_VIEW;
  const goals = map.nodes
    .filter(
      (n) =>
        !isLabel(n) &&
        n.status === "goal" &&
        matchesGoalFilter(n, habitIds, filter)
    )
    .sort((a, b) => {
      const sa = specRank.get(a.specId ?? "") ?? 99;
      const sb = specRank.get(b.specId ?? "") ?? 99;
      if (sa !== sb) return sa - sb;
      return a.x - b.x || a.y - b.y;
    });

  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  for (const g of goals) {
    nodes.push({ ...g });
    const section = nearestSection(g.id, parent, byId);
    if (section) {
      const cloneId = `${GOALS_PARENT_CLONE}${section.id}::${g.id}`;
      nodes.push({
        ...section,
        id: cloneId,
        role: "subgroup",
        header: undefined,
        status: "neutral",
        note: undefined,
        icon: undefined,
      });
      edges.push({
        id: `gv-e:${g.id}`,
        from: cloneId,
        to: g.id,
        kind: "down",
      });
    }
  }
  if (nodes.length === 0) return { nodes: [], edges: [] };
  const packed = organizeGoalsView(nodes, edges, maxRowW);
  return {
    nodes: packed.map((n) => ({ ...n, specId: viewId })),
    edges,
  };
}
