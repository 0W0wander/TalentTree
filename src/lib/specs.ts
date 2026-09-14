import type { MapEdge, MapNode, MindMap } from "./types";
import { ROOT_ID, ROOT_VIEW, isSideEdge, roleOf } from "./types";
import { newId } from "./presets";

/** Map every node to its (first) down-edge parent. */
export function parentOf(nodes: MapNode[], edges: MapEdge[]) {
  const ids = new Set(nodes.map((n) => n.id));
  const parent = new Map<string, string>();
  for (const e of edges) {
    if (isSideEdge(e)) continue;
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
    if (!parent.has(e.to)) parent.set(e.to, e.from);
  }
  return parent;
}

/** `startId` plus every box downstream of it (following down-edges). */
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

/**
 * Link two boxes as peers: same parent and drawn as a side branch.
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

  const parentFrom = down.find((e) => e.to === from)?.from;
  let edges = map.edges;
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

  return { ...map, edges };
}

/**
 * Bring any map (old spec-based saves included) into the single-tree model:
 * ensure a "Talent goals" root exists, hang every otherwise-parentless node
 * off it, turn former specialization roots into pinned nodes, and flag boxes
 * that belonged to habit specializations as habits. Idempotent for maps that
 * are already trees.
 */
export function migrateToTree(map: MindMap): MindMap {
  let nodes = map.nodes.map((n) => ({ ...n }));

  const specs = (map as unknown as { specs?: { id: string; kind?: string }[] })
    .specs;
  const habitSpecIds = new Set(
    (specs ?? []).filter((s) => s.kind === "habit").map((s) => s.id)
  );

  // Boxes that used to live under a habit specialization become habits.
  if (habitSpecIds.size > 0) {
    nodes = nodes.map((n) =>
      n.specId && habitSpecIds.has(n.specId) && roleOf(n) === "item"
        ? { ...n, habit: true }
        : n
    );
  }

  let edges = map.edges.map((e) => ({ ...e }));
  const parent = parentOf(nodes, edges);

  // Former specialization roots (top-level groups) become pins.
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.id === ROOT_ID) continue;
    if (parent.has(n.id)) continue;
    if (roleOf(n) !== "group") continue;
    if (!n.pinned) nodes[i] = { ...n, pinned: true };
  }

  // Ensure the single root node exists.
  let root = nodes.find((n) => n.id === ROOT_ID);
  if (!root) {
    const xs = nodes.map((n) => n.x).filter((x) => Number.isFinite(x));
    root = {
      id: ROOT_ID,
      title: map.title?.trim() || "Talent goals",
      status: "neutral",
      role: "group",
      pinned: false,
      x: xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 40,
      y: 20,
    };
    nodes = [root, ...nodes];
  } else {
    nodes = nodes.map((n) =>
      n.id === ROOT_ID
        ? { ...n, role: "group", pinned: false, title: n.title || "Talent goals" }
        : n
    );
  }

  // Hang every parentless node (except the root) off the root.
  for (const n of nodes) {
    if (n.id === ROOT_ID) continue;
    if (parent.has(n.id)) continue;
    edges = [...edges, { id: newId("e"), from: ROOT_ID, to: n.id, kind: "down" }];
  }

  // Drop the deprecated per-node specialization link.
  nodes = nodes.map((n) => {
    if (n.specId === undefined) return n;
    const { specId: _specId, ...rest } = n;
    void _specId;
    return rest;
  });

  return {
    version: map.version,
    title: root.title || "Talent goals",
    nodes,
    edges,
    activeView: ROOT_VIEW,
    layoutVersion: 0,
  };
}
