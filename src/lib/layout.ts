import type { MapEdge, MapNode, MindMap } from "./types";
import { roleOf, isSideEdge } from "./types";

/** Bump when the packer changes so older saves get a one-time re-pack. */
export const LAYOUT_VERSION = 7;

const H_GAP = 28;
const V_GAP = 36;
const GROUP_GAP = 56;
const ORIGIN_X = 36;
const ORIGIN_Y = 52;
/** Direct children sit in a row; wrap after this many columns. */
const MAX_COLS = 4;

const ITEM_W = 176;
const DONE_W = 156;
const CHAR_W = 6.6;

function wrapLines(text: string, maxChars: number): string[] {
  const tokens = text.split(/(\s+|\/)/);
  const lines: string[] = [];
  let cur = "";
  for (const token of tokens) {
    if (!token) continue;
    const next = cur + token;
    if (cur && next.length > maxChars) {
      lines.push(cur.trimEnd());
      cur = token.replace(/^\s+/, "");
    } else {
      cur = next;
    }
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines.length ? lines : [text];
}

function sizeOf(n: MapNode): { w: number; h: number } {
  const role = roleOf(n);
  const title = n.title || "Untitled";
  if (role === "group") {
    return { w: Math.min(280, Math.max(196, title.length * 9 + 44)), h: 54 };
  }
  if (role === "subgroup") {
    return { w: Math.min(260, Math.max(196, title.length * 8 + 40)), h: 52 };
  }
  if (role === "set") {
    return { w: Math.min(220, Math.max(160, title.length * 7.4 + 36)), h: 46 };
  }
  const done = n.status === "done";
  const w = n.w ?? (done ? DONE_W : ITEM_W);
  const chrome = done ? 58 : 68;
  const lines = wrapLines(title, Math.max(12, Math.floor((w - chrome) / CHAR_W)));
  const noteH = n.note ? 12 : 0;
  const lineH = done ? 12 : 12;
  const baseH = done ? 42 : 50;
  return { w, h: baseH + (lines.length - 1) * lineH + noteH };
}

/**
 * Walk edges into a forest. A node with several parents keeps the first
 * incoming edge so Organize still produces a tree (extra branches stay drawn).
 */
function forest(nodes: MapNode[], edges: MapEdge[]) {
  const ids = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = new Map<string, string[]>();
  const parent = new Map<string, string>();
  for (const n of nodes) kids.set(n.id, []);

  for (const e of edges) {
    if (isSideEdge(e)) continue;
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    if (e.from === e.to) continue;
    if (parent.has(e.to)) continue;
    parent.set(e.to, e.from);
    kids.get(e.from)!.push(e.to);
  }

  const visiting = new Set<string>();
  const seen = new Set<string>();
  function walk(id: string): boolean {
    if (visiting.has(id)) return true;
    if (seen.has(id)) return false;
    visiting.add(id);
    for (const c of kids.get(id) ?? []) {
      if (walk(c)) {
        kids.set(
          id,
          (kids.get(id) ?? []).filter((x) => x !== c)
        );
        parent.delete(c);
      }
    }
    visiting.delete(id);
    seen.add(id);
    return false;
  }
  for (const n of nodes) walk(n.id);

  const rank = (n: MapNode) => {
    const r = roleOf(n);
    if (r === "group") return 0;
    if (r === "subgroup") return 1;
    if (r === "set") return 2;
    return 3;
  };

  for (const [, list] of kids) {
    list.sort((a, b) => {
      const na = byId.get(a)!;
      const nb = byId.get(b)!;
      if (rank(na) !== rank(nb)) return rank(na) - rank(nb);
      return na.x - nb.x || na.y - nb.y;
    });
  }

  const roots = nodes
    .filter((n) => !parent.has(n.id))
    .sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return a.x - b.x || a.y - b.y;
    });

  return { kids, roots };
}

/** Connected components of root ids joined by side (peer) edges. */
function peerGroups(rootIds: string[], edges: MapEdge[]): string[][] {
  const set = new Set(rootIds);
  const adj = new Map<string, string[]>();
  for (const id of rootIds) adj.set(id, []);
  for (const e of edges) {
    if (!isSideEdge(e)) continue;
    if (!set.has(e.from) || !set.has(e.to)) continue;
    adj.get(e.from)!.push(e.to);
    adj.get(e.to)!.push(e.from);
  }
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const id of rootIds) {
    if (seen.has(id)) continue;
    const g: string[] = [];
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const cur = stack.pop()!;
      g.push(cur);
      for (const n of adj.get(cur) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
    groups.push(g);
  }
  return groups;
}

function chunk(ids: string[], maxCols: number): string[][] {
  if (ids.length <= maxCols) return [ids];
  const rows: string[][] = [];
  for (let i = 0; i < ids.length; i += maxCols) {
    rows.push(ids.slice(i, i + maxCols));
  }
  return rows;
}

type Metrics = {
  w: number;
  h: number;
  subW: number;
  subH: number;
  rows: string[][];
};

/**
 * Pack like a talent calculator: each child is its own column under the parent,
 * then that child's descendants stack beneath it. Wide families wrap to a new
 * row. The whole board is one tree, so every role — including bronze sets —
 * nests uniformly beneath its parent.
 */
export function organizeMap(map: MindMap): MindMap {
  const { kids, roots } = forest(map.nodes, map.edges);
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const metrics = new Map<string, Metrics>();

  function rowSize(row: string[]): { w: number; h: number } {
    let w = 0;
    let h = 0;
    for (const id of row) {
      const m = metrics.get(id)!;
      w += m.subW;
      h = Math.max(h, m.subH);
    }
    w += H_GAP * Math.max(0, row.length - 1);
    return { w, h };
  }

  function measure(id: string): Metrics {
    const n = byId.get(id)!;
    const s = sizeOf(n);
    const children = kids.get(id) ?? [];
    if (children.length === 0) {
      const m: Metrics = { w: s.w, h: s.h, subW: s.w, subH: s.h, rows: [] };
      metrics.set(id, m);
      return m;
    }
    for (const c of children) measure(c);
    const rows = chunk(children, MAX_COLS);
    let kidsW = 0;
    let kidsH = 0;
    for (const row of rows) {
      const rs = rowSize(row);
      kidsW = Math.max(kidsW, rs.w);
      kidsH += rs.h;
    }
    kidsH += V_GAP * Math.max(0, rows.length - 1);
    const m: Metrics = {
      w: s.w,
      h: s.h,
      subW: Math.max(s.w, kidsW),
      subH: s.h + V_GAP + kidsH,
      rows,
    };
    metrics.set(id, m);
    return m;
  }

  const pos = new Map<string, { x: number; y: number }>();

  function place(id: string, left: number, top: number) {
    const m = metrics.get(id)!;
    pos.set(id, { x: left + (m.subW - m.w) / 2, y: top });
    if (m.rows.length === 0) return;

    let y = top + m.h + V_GAP;
    for (const row of m.rows) {
      const rs = rowSize(row);
      let x = left + Math.max(0, (m.subW - rs.w) / 2);
      for (const c of row) {
        const cm = metrics.get(c)!;
        place(c, x, y);
        x += cm.subW + H_GAP;
      }
      y += rs.h + V_GAP;
    }
  }

  // Lay every root out left-to-right. Peers (joined by side edges) stay on the
  // same row; independent roots stack downward.
  const groups = peerGroups(
    roots.map((r) => r.id),
    map.edges
  );
  let x = ORIGIN_X;
  let y = ORIGIN_Y;
  let rowH = 0;
  for (const group of groups) {
    for (const id of group) measure(id);
    group.sort((a, b) => {
      const na = byId.get(a)!;
      const nb = byId.get(b)!;
      return na.x - nb.x || na.y - nb.y;
    });
    let gx = x;
    for (const id of group) {
      const m = metrics.get(id)!;
      place(id, gx, y);
      gx += m.subW + GROUP_GAP;
      rowH = Math.max(rowH, m.subH);
    }
    y += rowH + V_GAP;
    rowH = 0;
  }

  return {
    ...map,
    layoutVersion: LAYOUT_VERSION,
    nodes: map.nodes.map((n) => {
      const p = pos.get(n.id);
      return p ? { ...n, x: Math.round(p.x), y: Math.round(p.y) } : n;
    }),
  };
}
