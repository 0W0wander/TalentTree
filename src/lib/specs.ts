import type { MapEdge, MapNode, MindMap, Spec } from "./types";
import {
  ALL_SPECS,
  GOALS_VIEW,
  HABIT_GOALS_VIEW,
  HABIT_HUB_ID,
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

function downChildren(edges: MapEdge[]): Map<string, string[]> {
  const kids = new Map<string, string[]>();
  for (const e of edges) {
    if (isSideEdge(e)) continue;
    const list = kids.get(e.from);
    if (list) list.push(e.to);
    else kids.set(e.from, [e.to]);
  }
  return kids;
}

function subtreeHasItems(
  id: string,
  kids: Map<string, string[]>,
  byId: Map<string, MapNode>
): boolean {
  const n = byId.get(id);
  if (!n) return false;
  if (!isLabel(n)) return true;
  for (const c of kids.get(id) ?? []) {
    if (subtreeHasItems(c, kids, byId)) return true;
  }
  return false;
}

/**
 * Habit specs that still bundle several subgroups get split so each
 * subgroup is its own specialization. Wrapper groups with nothing left
 * are dropped. Idempotent once every habit spec is a single lane.
 */
export function ensureHabitLaneSpecs(map: MindMap): MindMap {
  const habitSpecs = (map.specs ?? []).filter((s) => isHabitSpec(s));
  if (habitSpecs.length === 0) return map;

  const lanes: MapNode[] = [];
  for (const spec of habitSpecs) {
    const nodes = map.nodes.filter((n) => n.specId === spec.id);
    const subgroups = nodes
      .filter((n) => roleOf(n) === "subgroup")
      .sort((a, b) => a.x - b.x || a.y - b.y);
    if (subgroups.length === 0) continue;
    if (subgroups.length === 1) {
      const mine = subtreeIds(subgroups[0].id, map.edges);
      const extras = nodes.filter((n) => !isLabel(n) && !mine.has(n.id));
      if (extras.length === 0) continue;
    }
    lanes.push(...subgroups);
  }
  if (lanes.length === 0) return map;

  let next: MindMap = map;
  let accentAt = next.specs.length;
  for (const lane of lanes) {
    const parentSpec = next.specs.find((s) => s.id === lane.specId);
    if (!parentSpec || !isHabitSpec(parentSpec)) continue;
    const inSpec = next.nodes.filter((n) => n.specId === parentSpec.id);
    const mine = subtreeIds(lane.id, next.edges);
    const siblings = inSpec.filter(
      (n) => roleOf(n) === "subgroup" && n.id !== lane.id
    );
    if (siblings.length === 0 && inSpec.every((n) => mine.has(n.id))) {
      continue;
    }
    const spec: Spec = {
      id: newId("spec"),
      name: lane.title.trim() || "Habit",
      icon: parentSpec.icon || "lightning",
      accent: ACCENT_PRESETS[accentAt % ACCENT_PRESETS.length],
      background: parentSpec.background || "forest",
      kind: "habit",
    };
    accentAt += 1;
    next = {
      ...next,
      specs: [...next.specs, spec],
    };
    next = moveSubtreeToSpec(next, lane.id, spec.id);
    next = {
      ...next,
      edges: next.edges.filter((e) => isSideEdge(e) || e.to !== lane.id),
    };
  }

  const kids = downChildren(next.edges);
  const byId = new Map(next.nodes.map((n) => [n.id, n]));
  const drop = new Set<string>();
  for (const n of next.nodes) {
    if (!isHabitSpec(next.specs.find((s) => s.id === n.specId))) continue;
    if (roleOf(n) !== "group") continue;
    if (n.id === HABIT_HUB_ID) continue;
    if (!subtreeHasItems(n.id, kids, byId)) drop.add(n.id);
  }
  if (drop.size) {
    next = {
      ...next,
      nodes: next.nodes.filter((n) => !drop.has(n.id)),
      edges: next.edges.filter((e) => !drop.has(e.from) && !drop.has(e.to)),
    };
  }

  const used = new Set(next.nodes.map((n) => n.specId).filter(Boolean));
  const specs = next.specs.filter((s) => !isHabitSpec(s) || used.has(s.id));
  if (specs.length === 0) return next;

  const leftover = specs.filter((s) => isHabitSpec(s));
  const renamed = leftover.length
    ? specs.map((s) => {
        if (!isHabitSpec(s)) return s;
        const labels = next.nodes.filter(
          (n) => n.specId === s.id && isLabel(n)
        );
        if (labels.length !== 1) return s;
        const name = labels[0].title.trim();
        return name && name !== s.name ? { ...s, name } : s;
      })
    : specs;

  const active =
    next.activeSpecId === ALL_SPECS ||
    isGoalsBoard(next.activeSpecId) ||
    renamed.some((s) => s.id === next.activeSpecId)
      ? next.activeSpecId
      : ALL_SPECS;

  return {
    ...next,
    specs: renamed,
    activeSpecId: active,
    layoutVersion: 0,
  };
}

export function isHabitOverviewSpec(map: MindMap, spec: Spec): boolean {
  return map.nodes.some((n) => n.id === HABIT_HUB_ID && n.specId === spec.id);
}

/** Habit category tabs — excludes the All Habits hub spec. */
export function habitTabSpecs(map: MindMap): Spec[] {
  return (map.specs ?? []).filter(
    (s) => isHabitSpec(s) && !isHabitOverviewSpec(map, s)
  );
}

function rewriteNodeId(
  map: MindMap,
  fromId: string,
  toId: string
): MindMap {
  if (fromId === toId) return map;
  return {
    ...map,
    nodes: map.nodes.map((n) => (n.id === fromId ? { ...n, id: toId } : n)),
    edges: map.edges.map((e) => ({
      ...e,
      from: e.from === fromId ? toId : e.from,
      to: e.to === fromId ? toId : e.to,
    })),
  };
}

/**
 * One "Habits" group sits above every habit subgroup so All Habits reads
 * as a single tree. Category specs stay separate; this only wires the hub.
 */
export function ensureHabitHub(map: MindMap): MindMap {
  const habitSpecs = (map.specs ?? []).filter((s) => isHabitSpec(s));
  if (habitSpecs.length === 0) return map;

  let next: MindMap = map;
  let changed = false;
  let hub = next.nodes.find((n) => n.id === HABIT_HUB_ID);

  if (!hub) {
    const existing = next.nodes.find(
      (n) =>
        roleOf(n) === "group" &&
        n.title.trim().toLowerCase() === "habits" &&
        isHabitSpec(next.specs.find((s) => s.id === n.specId))
    );
    if (existing) {
      next = rewriteNodeId(next, existing.id, HABIT_HUB_ID);
      next = {
        ...next,
        nodes: next.nodes.map((n) =>
          n.id === HABIT_HUB_ID ? { ...n, title: "Habits", role: "group" } : n
        ),
      };
      hub = next.nodes.find((n) => n.id === HABIT_HUB_ID);
      changed = true;
    } else {
      let overview = habitSpecs.find(
        (s) =>
          s.id === "spec_habits" || s.name.trim().toLowerCase() === "habits"
      );
      if (!overview) {
        overview = {
          id: newId("spec"),
          name: "Habits",
          icon: "lightning",
          accent: "#5fc84a",
          background: "forest",
          kind: "habit",
        };
        next = { ...next, specs: [...next.specs, overview] };
      }
      const xs = next.nodes
        .filter((n) => n.specId && habitSpecs.some((s) => s.id === n.specId))
        .map((n) => n.x);
      hub = {
        id: HABIT_HUB_ID,
        title: "Habits",
        status: "neutral",
        role: "group",
        specId: overview.id,
        x: xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 80,
        y: 40,
      };
      next = { ...next, nodes: [...next.nodes, hub] };
      changed = true;
    }
  }

  const parent = parentOf(next.nodes, next.edges);
  const habitIds = new Set(
    next.specs.filter((s) => isHabitSpec(s)).map((s) => s.id)
  );
  let edges = next.edges;
  for (const n of next.nodes) {
    if (n.id === HABIT_HUB_ID) continue;
    if (!n.specId || !habitIds.has(n.specId)) continue;
    if (parent.has(n.id)) continue;
    const exists = edges.some(
      (e) => !isSideEdge(e) && e.from === HABIT_HUB_ID && e.to === n.id
    );
    if (exists) continue;
    edges = [
      ...edges,
      { id: newId("e"), from: HABIT_HUB_ID, to: n.id, kind: "down" },
    ];
    changed = true;
  }

  if (!changed && edges === next.edges) return map;
  return {
    ...next,
    edges,
    layoutVersion: 0,
  };
}

export function spawnHabitLaneSpec(
  map: MindMap,
  title = "New Subgroup"
): { map: MindMap; node: MapNode; spec: Spec } {
  const hub = map.nodes.find((n) => n.id === HABIT_HUB_ID);
  const spec: Spec = {
    id: newId("spec"),
    name: title.trim() || "New Subgroup",
    icon: ICON_PRESETS[map.specs.length % ICON_PRESETS.length].key,
    accent: ACCENT_PRESETS[map.specs.length % ACCENT_PRESETS.length],
    background: "forest",
    kind: "habit",
  };
  const node: MapNode = {
    id: newId("n"),
    title: spec.name,
    status: "neutral",
    role: "subgroup",
    specId: spec.id,
    x: Math.round((hub?.x ?? 80) + 40),
    y: Math.round((hub?.y ?? 40) + 80),
  };
  let next: MindMap = {
    ...map,
    specs: [...map.specs, spec],
    nodes: [...map.nodes, node],
  };
  next = ensureHabitHub(next);
  return { map: next, node, spec };
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
  name: "HGoals",
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
