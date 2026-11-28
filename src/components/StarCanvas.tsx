"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MapNode, MapEdge, NodeStatus, Spec, EdgeKind } from "@/lib/types";
import { isLabel, isSideEdge, roleOf } from "@/lib/types";
import { ICON_PRESETS, STATUS_META, resolveIcon } from "@/lib/presets";

/* ============================================================= */
/*  Expandable constellation view.                               */
/*                                                               */
/*  A central "star of everything" radiates spokes out to        */
/*  category icons. Click a point to open its children;          */
/*  double-click opens the whole branch. Click-hold and drag    */
/*  from one icon onto another to bond them. Right-click sets   */
/*  the border (golden = goal) or adds the next step.           */
/* ============================================================= */

const SYNTH = "__star_center__";

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.4;

const RING0 = 260; // radius of the first ring (categories)
const STEP = 200; // extra radius per deeper ring
const WEDGE_PAD = 0.84; // keep gaps between category sectors
const INNER_PAD = 0.07; // keep gaps between sibling sub-branches

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

type View = { x: number; y: number; scale: number };

type Placed = {
  id: string;
  depth: number;
  x: number;
  y: number;
  r: number;
};

const STATUS_RING: NodeStatus[] = [
  "goal",
  "done",
  "progress",
  "special",
  "neutral",
];

/** A short label for the hover tooltip's status pip. */
const STATUS_HINT: Record<NodeStatus, string> = {
  goal: "My goal",
  done: "Done",
  progress: "Used to",
  special: "Special",
  neutral: "Not started",
};

function hashIndex(id: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h % mod;
}

type Props = {
  nodes: MapNode[];
  edges: MapEdge[];
  specs: Spec[];
  /** Title for the synthetic centre when several branches share the sky. */
  title: string;
  /** Show every node's name under it rather than only on hover. */
  showLabels?: boolean;
  onEditNode: (id: string) => void;
  onCreateLinked: (from: string, x: number, y: number, kind?: EdgeKind) => void;
  /** Drag from the parent icon onto the icon that should hang under it. */
  onConnect: (from: string, to: string) => void;
  /** Cut the solid spoke that leads into this icon. */
  onCut: (childId: string) => void;
  onDeleteEdge: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onSetStatus: (id: string, status: NodeStatus) => void;
  /** Bumped by the page when the view changes, so we re-frame the sky. */
  viewEpoch?: number;
};

export default function StarCanvas({
  nodes,
  edges,
  specs,
  title,
  showLabels = false,
  onEditNode,
  onCreateLinked,
  onConnect,
  onCut,
  onDeleteEdge,
  onDeleteNode,
  onSetStatus,
  viewEpoch = 0,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [panning, setPanning] = useState(false);
  const pan = useRef<{
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** Categories whose in-between steps are hidden so their goals hang on directly. */
  const [goalFocus, setGoalFocus] = useState<Set<string>>(() => new Set());
  const [hover, setHover] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<{
    childId: string;
    x: number;
    y: number;
  } | null>(null);
  const [link, setLink] = useState<{ from: string; x: number; y: number } | null>(
    null
  );
  const [dropId, setDropId] = useState<string | null>(null);
  const clickTimer = useRef<number | null>(null);
  const dragFrom = useRef<string | null>(null);
  const suppressClick = useRef(false);

  const nodeById = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes]
  );
  const specById = useMemo(
    () => new Map(specs.map((s) => [s.id, s])),
    [specs]
  );
  const specOrder = useMemo(() => {
    const m = new Map<string, number>();
    specs.forEach((s, i) => m.set(s.id, i));
    return m;
  }, [specs]);

  /* ---------------- build the hierarchy ---------------- */
  const { childrenOf, center, centerChildren } = useMemo(() => {
    const present = new Set(nodes.map((n) => n.id));
    const childrenOf = new Map<string, string[]>();
    const hasParent = new Set<string>();
    for (const e of edges) {
      if (isSideEdge(e)) continue;
      if (!present.has(e.from) || !present.has(e.to)) continue;
      if (!childrenOf.has(e.from)) childrenOf.set(e.from, []);
      childrenOf.get(e.from)!.push(e.to);
      hasParent.add(e.to);
    }
    const roots = nodes.filter((n) => !hasParent.has(n.id));
    roots.sort((a, b) => {
      const sa = specOrder.get(a.specId ?? "") ?? 99;
      const sb = specOrder.get(b.specId ?? "") ?? 99;
      if (sa !== sb) return sa - sb;
      if (a.y !== b.y) return a.y - b.y;
      return (a.title || "").localeCompare(b.title || "");
    });
    const center = roots.length === 1 ? roots[0]!.id : SYNTH;
    const centerChildren =
      center === SYNTH ? roots.map((r) => r.id) : childrenOf.get(center) ?? [];
    return { childrenOf, center, centerChildren };
  }, [nodes, edges, specOrder]);

  const synthetic = center === SYNTH;

  // When a synthetic centre's branches all belong to one specialization
  // (e.g. a single-spec tab), wear that spec's icon instead of the crest.
  const synthSpec = useMemo(() => {
    if (!synthetic) return undefined;
    const ids = new Set<string>();
    for (const id of centerChildren) {
      const s = nodeById.get(id)?.specId;
      if (s) ids.add(s);
    }
    if (ids.size !== 1) return undefined;
    return specById.get([...ids][0]!);
  }, [synthetic, centerChildren, nodeById, specById]);

  /* Reset the expansion state (back to a plain star) whenever the sky
     itself changes — a new specialization, mode, or goals board. */
  const lastCenter = useRef<string | null>(null);
  useEffect(() => {
    if (lastCenter.current === center) return;
    lastCenter.current = center;
    // Cutting a line can change which node counts as the centre. Leave the
    // picture alone — the freed icon just stays where it was.
    if (floatedRef.current) return;
    setExpanded(new Set());
    setGoalFocus(new Set());
    setCtxMenu(null);
    setHover(null);
  }, [center]);

  /** First-ring category for a node, and the goals hiding under each category. */
  const { categoryOf, goalsByCategory } = useMemo(() => {
    const up = new Map<string, string>();
    for (const [parent, kids] of childrenOf) {
      for (const kid of kids) up.set(kid, parent);
    }
    for (const id of centerChildren) up.set(id, center);

    const categoryOf = (id: string): string | null => {
      if (id === center || id === SYNTH) return null;
      let cur = id;
      const seen = new Set<string>();
      while (cur && !seen.has(cur)) {
        if (centerChildren.includes(cur)) return cur;
        seen.add(cur);
        const parent = up.get(cur);
        if (!parent || parent === center || parent === SYNTH) break;
        cur = parent;
      }
      return centerChildren.includes(id) ? id : null;
    };

    const goalsByCategory = new Map<string, string[]>();
    const goalsUnder = (categoryId: string): string[] => {
      const out: string[] = [];
      const seen = new Set<string>();
      const walk = (id: string) => {
        if (seen.has(id)) return;
        seen.add(id);
        for (const kid of childrenOf.get(id) ?? []) {
          if (seen.has(kid)) continue;
          const node = nodeById.get(kid);
          if (node?.status === "goal") out.push(kid);
          walk(kid);
        }
      };
      walk(categoryId);
      return out;
    };
    for (const id of centerChildren) goalsByCategory.set(id, goalsUnder(id));
    return { categoryOf, goalsByCategory };
  }, [childrenOf, centerChildren, center, nodeById]);

  const isExpanded = useCallback(
    (id: string) => id === center || expanded.has(id),
    [center, expanded]
  );

  const visibleChildren = useCallback(
    (id: string): string[] => {
      if (goalFocus.has(id)) return goalsByCategory.get(id) ?? [];
      if (!isExpanded(id)) return [];
      if (id === center && synthetic) return centerChildren;
      return (childrenOf.get(id) ?? []).filter((c) => nodeById.has(c));
    },
    [
      goalFocus,
      goalsByCategory,
      isExpanded,
      center,
      synthetic,
      centerChildren,
      childrenOf,
      nodeById,
    ]
  );

  /* ---------------- radial layout ---------------- */
  const prevEdgesRef = useRef<Set<string> | null>(null);
  const prevLayoutRef = useRef<{
    placed: Map<string, Placed>;
    parentOf: Map<string, string>;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    layoutCenter: string;
  } | null>(null);
  /** A cut should leave icons where they are and must not refit the camera. */
  const floatedRef = useRef(false);

  const { placed, parentOf, bounds, layoutCenter } = useMemo(() => {
    const edgeIds = new Set(
      edges
        .filter((e) => !isSideEdge(e))
        .map((e) => `${e.from}->${e.to}`)
    );
    const prevEdges = prevEdgesRef.current;
    const onlyCut =
      prevEdges != null &&
      prevLayoutRef.current != null &&
      edgeIds.size < prevEdges.size &&
      [...edgeIds].every((id) => prevEdges.has(id));
    prevEdgesRef.current = edgeIds;
    if (onlyCut && prevLayoutRef.current) {
      floatedRef.current = true;
      const kept = new Map(prevLayoutRef.current.parentOf);
      for (const [child, parent] of kept) {
        if (parent === SYNTH) continue;
        if (!edgeIds.has(`${parent}->${child}`)) kept.delete(child);
      }
      const still = new Map(prevLayoutRef.current.placed);
      for (const id of still.keys()) {
        if (id !== SYNTH && !nodeById.has(id)) still.delete(id);
      }
      const frozen = {
        placed: still,
        parentOf: kept,
        bounds: prevLayoutRef.current.bounds,
        layoutCenter: prevLayoutRef.current.layoutCenter,
      };
      prevLayoutRef.current = frozen;
      return frozen;
    }
    floatedRef.current = false;
    const placed = new Map<string, Placed>();
    const parentOf = new Map<string, string>();

    if (nodes.length === 0 && !synthetic) {
      return {
        placed,
        parentOf,
        bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
      };
    }

    const radiusOf = (id: string, isCentre: boolean): number => {
      if (isCentre) return synthetic ? 54 : 48;
      const node = nodeById.get(id);
      const role = node ? roleOf(node) : "item";
      if (role === "group") return 40;
      if (role === "subgroup") return 37;
      if (role === "set") return 33;
      return 32;
    };

    const leafCount = (id: string): number => {
      const kids = visibleChildren(id);
      if (kids.length === 0) return 1;
      let sum = 0;
      for (const k of kids) sum += leafCount(k);
      return sum;
    };

    const place = (id: string, depth: number, a0: number, a1: number) => {
      if (placed.has(id)) return;
      const ang = (a0 + a1) / 2;
      const rad = depth === 0 ? 0 : RING0 + (depth - 1) * STEP;
      placed.set(id, {
        id,
        depth,
        x: Math.cos(ang) * rad,
        y: Math.sin(ang) * rad,
        r: radiusOf(id, depth === 0),
      });
      const kids = visibleChildren(id);
      if (kids.length === 0) return;
      let total = 0;
      for (const k of kids) total += leafCount(k);
      if (total <= 0) total = kids.length || 1;
      const padA = (a1 - a0) * INNER_PAD;
      let lo = a0 + padA;
      let hi = a1 - padA;
      if (hi <= lo) {
        lo = a0;
        hi = a1;
      }
      let a = lo;
      for (const k of kids) {
        const span = (hi - lo) * (leafCount(k) / total);
        parentOf.set(k, id);
        place(k, depth + 1, a, a + span);
        a += span;
      }
    };

    // Centre sits at the origin; categories take equal sectors so the
    // star stays balanced however deep a single branch is expanded.
    placed.set(center, { id: center, depth: 0, x: 0, y: 0, r: radiusOf(center, true) });
    const cks = centerChildren.filter(
      (c) => nodeById.has(c) || (synthetic && nodeById.has(c))
    );
    const n = Math.max(1, cks.length);
    cks.forEach((k, i) => {
      const mid = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2;
      const half = ((Math.PI * 2) / n) * 0.5 * WEDGE_PAD;
      parentOf.set(k, center);
      place(k, 1, mid - half, mid + half);
    });

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    placed.forEach((p) => {
      minX = Math.min(minX, p.x - p.r);
      minY = Math.min(minY, p.y - p.r);
      maxX = Math.max(maxX, p.x + p.r);
      maxY = Math.max(maxY, p.y + p.r);
    });
    if (!Number.isFinite(minX)) {
      minX = -60;
      minY = -60;
      maxX = 60;
      maxY = 60;
    }
    const fresh = {
      placed,
      parentOf,
      bounds: { minX, minY, maxX, maxY },
      layoutCenter: center,
    };
    prevLayoutRef.current = fresh;
    return fresh;
  }, [edges, nodes, synthetic, center, centerChildren, visibleChildren, nodeById]);

  const placedRef = useRef(placed);
  placedRef.current = placed;

  function clientToWorld(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (clientX - rect.left - v.x) / v.scale,
      y: (clientY - rect.top - v.y) / v.scale,
    };
  }

  function hitAt(wx: number, wy: number, skip?: string): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    placedRef.current.forEach((p) => {
      if (p.id === skip || p.id === SYNTH) return;
      const d = Math.hypot(wx - p.x, wy - p.y);
      if (d <= p.r + 12 && d < bestD) {
        best = p.id;
        bestD = d;
      }
    });
    return best;
  }

  function clearDrag() {
    dragFrom.current = null;
    setLink(null);
    setDropId(null);
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 80);
  }

  /* ---------------- view framing ---------------- */
  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    if (w <= 0 || h <= 0) return;
    const pad = 80;
    const scale = clamp(
      Math.min((cw - pad * 2) / w, (ch - pad * 2) / h),
      MIN_SCALE,
      1.2
    );
    const x = cw / 2 - ((bounds.minX + bounds.maxX) / 2) * scale;
    const y = ch / 2 - ((bounds.minY + bounds.maxY) / 2) * scale;
    setView({ x, y, scale });
  }, [bounds]);

  // Re-frame only when the sky itself changes (new view / first paint) —
  // never on a mere expand, so the user keeps their place. We read the
  // latest `fit` through a ref so a changing bounds closure can't cancel
  // the scheduled frame.
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const framedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = `${center}:${viewEpoch}`;
    // Set the guard inside the frame (not synchronously) so React Strict
    // Mode's mount/cleanup/mount cycle can't leave us guarded but unframed.
    const raf = requestAnimationFrame(() => {
      if (framedFor.current === key) return;
      framedFor.current = key;
      if (floatedRef.current) return;
      fitRef.current();
    });
    return () => cancelAnimationFrame(raf);
  }, [center, viewEpoch]);

  /* ---------------- pan + zoom ---------------- */
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = pan.current;
      if (!d) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
      setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    }
    function onUp() {
      pan.current = null;
      setPanning(false);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView((v) => {
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const ns = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
        const wx = (mx - v.x) / v.scale;
        const wy = (my - v.y) / v.scale;
        return { x: mx - wx * ns, y: my - wy * ns, scale: ns };
      });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function zoomBy(factor: number) {
    const el = canvasRef.current;
    if (!el) return;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    setView((v) => {
      const ns = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const wx = (cx - v.x) / v.scale;
      const wy = (cy - v.y) / v.scale;
      return { x: cx - wx * ns, y: cy - wy * ns, scale: ns };
    });
  }

  function onBackgroundPointerDown(e: React.PointerEvent) {
    if (e.button === 1) {
      e.preventDefault();
      focusGoals(center);
      return;
    }
    if (e.button !== 0) return;
    setCtxMenu(null);
    pan.current = {
      sx: e.clientX,
      sy: e.clientY,
      ox: view.x,
      oy: view.y,
      moved: false,
    };
    setPanning(true);
  }

  /* ---------------- node interactions ---------------- */
  const toggle = useCallback(
    (id: string) => {
      if (id === center) {
        // Clicking the heart of the star collapses everything back to it.
        setExpanded(new Set());
        return;
      }
      const kids = childrenOf.get(id) ?? [];
      if (kids.length === 0) return;
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [center, childrenOf]
  );

  /**
   * Middle-click opens a category's goals in place. The rest of the star
   * stays put. Middle-click that category again to put the steps back.
   * Middle-click the centre to do this for every category.
   */
  function focusGoals(id: string) {
    setGoalFocus((prev) => {
      const next = new Set(prev);
      if (id === center || id === SYNTH) {
        const allOn =
          centerChildren.length > 0 &&
          centerChildren.every((c) => next.has(c));
        return allOn ? new Set() : new Set(centerChildren);
      }
      const cat = categoryOf(id);
      if (!cat) return prev;
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function onNodeClick(id: string) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (clickTimer.current != null) return;
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      toggle(id);
    }, 200);
  }

  /** Open this icon and every nested branch under it. */
  function expandAll(id: string) {
    const seen = new Set<string>();
    const open: string[] = [];
    const kidsOf = (cur: string): string[] => {
      if (cur === center && synthetic) return centerChildren;
      return (childrenOf.get(cur) ?? []).filter((k) => nodeById.has(k));
    };
    const walk = (cur: string) => {
      if (seen.has(cur)) return;
      seen.add(cur);
      const kids = kidsOf(cur);
      if (kids.length === 0) return;
      open.push(cur);
      for (const k of kids) walk(k);
    };
    walk(id);
    if (open.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const x of open) next.add(x);
      return next;
    });
    // The branch can sprawl past the screen; reframe once it has laid out.
    requestAnimationFrame(() => fitRef.current());
  }

  function onNodeDoubleClick(id: string) {
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    expandAll(id);
  }

  function onNodeContextMenu(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (id === SYNTH) return;
    pan.current = null;
    setPanning(false);
    setEdgeMenu(null);
    setCtxMenu({ id, x: e.clientX, y: e.clientY });
  }

  useEffect(() => {
    if (!ctxMenu && !edgeMenu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setCtxMenu(null);
        setEdgeMenu(null);
      }
    }
    function close() {
      setCtxMenu(null);
      setEdgeMenu(null);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", close);
    window.addEventListener("wheel", close, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("wheel", close);
    };
  }, [ctxMenu, edgeMenu]);

  function attach(from: string, to: string) {
    onConnect(from, to);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(from);
      return next;
    });
  }

  function addStep(parentId: string) {
    const p = placed.get(parentId);
    const wx = p ? p.x : 0;
    const wy = p ? p.y + 120 : 120;
    onCreateLinked(parentId, wx, wy, "down");
    setExpanded((prev) => new Set(prev).add(parentId));
    setCtxMenu(null);
  }

  /* ---------------- icon + helpers ---------------- */
  function iconFor(id: string, isCentre: boolean): string {
    if (isCentre && synthetic) {
      return synthSpec ? resolveIcon(synthSpec.icon) : "/assets/dragon-crest.png";
    }
    const node = nodeById.get(id);
    if (!node) return "/assets/dragon-crest.png";
    if (node.icon) return resolveIcon(node.icon);
    const spec = node.specId ? specById.get(node.specId) : undefined;
    if (isLabel(node) && spec) return resolveIcon(spec.icon);
    if (spec && isCentre) return resolveIcon(spec.icon);
    return resolveIcon(ICON_PRESETS[hashIndex(node.id, ICON_PRESETS.length)]!.key);
  }

  function labelFor(id: string, isCentre: boolean): string {
    if (isCentre && synthetic) return title;
    const node = nodeById.get(id);
    return node?.title?.trim() || "Untitled";
  }

  function statusOf(id: string): NodeStatus {
    const node = nodeById.get(id);
    if (!node || isLabel(node)) return "neutral";
    return node.status;
  }

  /* ---------------- render geometry ---------------- */
  const pad = 140;
  let extMinX = bounds.minX;
  let extMinY = bounds.minY;
  let extMaxX = bounds.maxX;
  let extMaxY = bounds.maxY;
  if (link) {
    extMinX = Math.min(extMinX, link.x);
    extMinY = Math.min(extMinY, link.y);
    extMaxX = Math.max(extMaxX, link.x);
    extMaxY = Math.max(extMaxY, link.y);
  }
  const svgOx = extMinX - pad;
  const svgOy = extMinY - pad;
  const svgW = Math.max(2, extMaxX - extMinX + pad * 2);
  const svgH = Math.max(2, extMaxY - extMinY + pad * 2);

  type Line = {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    goal: boolean;
    real: boolean;
  };
  const lines: Line[] = [];
  placed.forEach((c) => {
    if (c.id === center) return;
    const parentId = parentOf.get(c.id);
    if (!parentId) return;
    const p = placed.get(parentId);
    if (!p) return;
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const realSpoke =
      (parentId === center && synthetic && centerChildren.includes(c.id)) ||
      (childrenOf.get(parentId) ?? []).includes(c.id);
    lines.push({
      id: c.id,
      x1: p.x + ux * (p.r + 2) - svgOx,
      y1: p.y + uy * (p.r + 2) - svgOy,
      x2: c.x - ux * (c.r + 2) - svgOx,
      y2: c.y - uy * (c.r + 2) - svgOy,
      goal: statusOf(c.id) === "goal",
      real: realSpoke,
    });
  });

  type Bond = { id: string; d: string };
  const bonds: Bond[] = [];
  for (const edge of edges) {
    if (!isSideEdge(edge)) continue;
    const a = placed.get(edge.from);
    const b = placed.get(edge.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const bow = Math.min(56, dist * 0.2);
    const x1 = a.x + ux * (a.r + 4) - svgOx;
    const y1 = a.y + uy * (a.r + 4) - svgOy;
    const x2 = b.x - ux * (b.r + 4) - svgOx;
    const y2 = b.y - uy * (b.r + 4) - svgOy;
    const cpx = (x1 + x2) / 2 + -uy * bow;
    const cpy = (y1 + y2) / 2 + ux * bow;
    bonds.push({
      id: edge.id,
      d: `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`,
    });
  }

  let preview: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (link) {
    const from = placed.get(link.from);
    if (from) {
      const dx = link.x - from.x;
      const dy = link.y - from.y;
      const dist = Math.hypot(dx, dy) || 1;
      preview = {
        x1: from.x + (dx / dist) * (from.r + 4) - svgOx,
        y1: from.y + (dy / dist) * (from.r + 4) - svgOy,
        x2: link.x - svgOx,
        y2: link.y - svgOy,
      };
    }
  }

  const placedList = Array.from(placed.values()).sort((a, b) => a.depth - b.depth);
  const ctxNode = ctxMenu ? nodeById.get(ctxMenu.id) : undefined;
  const ctxIsLabel = ctxNode ? isLabel(ctxNode) : false;
  const ctxHasKids = ctxMenu ? (childrenOf.get(ctxMenu.id) ?? []).length > 0 : false;

  return (
    <div
      ref={canvasRef}
      className={`star-canvas ${panning ? "is-panning" : ""} ${
        link ? "is-linking" : ""
      }`}
      onPointerDown={onBackgroundPointerDown}
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      onDragOver={(e) => {
        if (!dragFrom.current) return;
        e.preventDefault();
        const w = clientToWorld(e.clientX, e.clientY);
        setLink({ from: dragFrom.current, x: w.x, y: w.y });
        setDropId(hitAt(w.x, w.y, dragFrom.current));
      }}
      onDrop={(e) => {
        if (!dragFrom.current) return;
        e.preventDefault();
        const from = dragFrom.current;
        const w = clientToWorld(e.clientX, e.clientY);
        const over = hitAt(w.x, w.y, from);
        if (over) attach(from, over);
        clearDrag();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="star-sky" />
      <div
        className="star-world"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}
      >
        <svg
          className="star-edges"
          style={{ left: svgOx, top: svgOy }}
          width={svgW}
          height={svgH}
        >
          {lines.map((l) => (
            <g key={`edge-${l.id}`}>
              <line
                className="star-edge glow"
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
              />
              <line
                className={`star-edge ${l.goal ? "goal" : ""}`}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
              />
              {l.real && (
                <line
                  className="star-edge hit"
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  onPointerDown={(e) => e.stopPropagation()}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCtxMenu(null);
                    setEdgeMenu({
                      childId: l.id,
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }}
                >
                  <title>Right-click to cut this line</title>
                </line>
              )}
            </g>
          ))}
          {bonds.map((b) => (
            <g key={`bond-${b.id}`}>
              <path className="star-bond glow" d={b.d} />
              <path className="star-bond line" d={b.d} />
              <path
                className="star-bond hit"
                d={b.d}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onDeleteEdge(b.id);
                }}
              >
                <title>Click to remove this connection</title>
              </path>
            </g>
          ))}
          {preview && (
            <line
              className="star-edge preview"
              x1={preview.x1}
              y1={preview.y1}
              x2={preview.x2}
              y2={preview.y2}
            />
          )}
        </svg>

        {placedList.map((p) => {
          const isCentre = p.id === layoutCenter;
          const node = nodeById.get(p.id);
          const status = isCentre ? "neutral" : statusOf(p.id);
          const kids = childrenOf.get(p.id) ?? [];
          const open = isExpanded(p.id) && kids.length > 0;
          const canOpen = kids.length > 0;
          const cls = [
            "star-node",
            isCentre ? "is-center" : "",
            synthetic && isCentre && !synthSpec ? "is-synthetic" : "",
            node && isLabel(node) ? "is-label" : "",
            !isCentre ? status : "",
            canOpen ? "can-open" : "",
            open ? "is-open" : "",
            hover?.id === p.id ? "is-hover" : "",
            link?.from === p.id ? "is-source" : "",
            dropId === p.id ? "is-drop" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={p.id}
              className={cls}
              role="button"
              tabIndex={0}
              aria-label={labelFor(p.id, isCentre)}
              draggable={p.id !== SYNTH}
              style={{
                left: p.x - p.r,
                top: p.y - p.r,
                width: p.r * 2,
                height: p.r * 2,
              }}
              onPointerDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  e.stopPropagation();
                  focusGoals(p.id);
                  return;
                }
                e.stopPropagation();
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onDragStart={(e) => {
                if (p.id === SYNTH) {
                  e.preventDefault();
                  return;
                }
                dragFrom.current = p.id;
                e.dataTransfer.setData("text/plain", p.id);
                e.dataTransfer.effectAllowed = "link";
                const blank = new Image();
                blank.src =
                  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
                e.dataTransfer.setDragImage(blank, 0, 0);
                suppressClick.current = true;
                if (clickTimer.current != null) {
                  window.clearTimeout(clickTimer.current);
                  clickTimer.current = null;
                }
                setLink({ from: p.id, x: p.x, y: p.y });
              }}
              onDragEnd={clearDrag}
              onDragOver={(e) => {
                const from = dragFrom.current;
                if (!from || from === p.id || p.id === SYNTH) return;
                e.preventDefault();
                e.stopPropagation();
                const w = clientToWorld(e.clientX, e.clientY);
                setLink({ from, x: w.x, y: w.y });
                setDropId(p.id);
              }}
              onDrop={(e) => {
                const from = dragFrom.current;
                if (!from || from === p.id || p.id === SYNTH) return;
                e.preventDefault();
                e.stopPropagation();
                attach(from, p.id);
                clearDrag();
              }}
              onClick={(e) => {
                e.stopPropagation();
                onNodeClick(p.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onNodeDoubleClick(p.id);
              }}
              onContextMenu={(e) => onNodeContextMenu(e, p.id)}
              onMouseEnter={(e) => {
                const rect = canvasRef.current?.getBoundingClientRect();
                const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
                if (!rect) return;
                setHover({
                  id: p.id,
                  x: b.left - rect.left + b.width / 2,
                  y: b.top - rect.top,
                });
              }}
              onMouseLeave={() =>
                setHover((h) => (h?.id === p.id ? null : h))
              }
            >
              <span className="star-halo" />
              <span className="star-disc">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={iconFor(p.id, isCentre)} alt="" draggable={false} />
              </span>
              {canOpen && !isCentre && (
                <span className={`star-badge ${open ? "open" : ""}`}>
                  {open ? "–" : "+"}
                </span>
              )}
              {showLabels && (
                <span className="star-label-under">
                  {labelFor(p.id, isCentre)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {hover && !showLabels && (
        <div
          className="star-tip"
          style={{ left: hover.x, top: hover.y }}
        >
          <span className="star-tip-name">
            {labelFor(hover.id, hover.id === center)}
          </span>
          {(() => {
            const node = nodeById.get(hover.id);
            if (!node) return null;
            return (
              <>
                {node.note ? (
                  <span className="star-tip-note">{node.note}</span>
                ) : null}
                {!isLabel(node) ? (
                  <span className={`star-tip-status ${node.status}`}>
                    {STATUS_HINT[node.status]}
                  </span>
                ) : null}
              </>
            );
          })()}
        </div>
      )}

      {/* view controls */}
      <div
        className="absolute bottom-3 right-3 z-30 flex flex-col gap-1.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          className="btn-steel !px-3 !py-1.5"
          onClick={() => zoomBy(1.2)}
          title="Zoom in"
        >
          +
        </button>
        <button
          className="btn-steel !px-3 !py-1.5"
          onClick={() => zoomBy(1 / 1.2)}
          title="Zoom out"
        >
          −
        </button>
        <button
          className="btn-steel !px-3 !py-1.5"
          onClick={fit}
          title="Re-centre the constellation"
        >
          ⤢
        </button>
      </div>

      <div className="absolute bottom-3 left-3 z-30 text-[11px] text-[#8b909b] pointer-events-none">
        {Math.round(view.scale * 100)}%
      </div>
      {goalFocus.size > 0 && (
        <div className="star-focus-note">
          Goals only · middle-click to restore
        </div>
      )}

      {edgeMenu && (
        <div
          className="node-menu steel-panel gold-trim"
          style={{ left: edgeMenu.x, top: edgeMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="node-menu-item danger"
            onClick={() => {
              const id = edgeMenu.childId;
              setEdgeMenu(null);
              onCut(id);
            }}
          >
            Cut line
          </button>
        </div>
      )}

      {ctxMenu && ctxNode && (
        <div
          className="node-menu steel-panel gold-trim"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {!ctxIsLabel && (
            <>
              <div className="node-menu-head">Set the border</div>
              <div className="star-status-row">
                {STATUS_RING.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`star-status-dot ${s} ${
                      ctxNode.status === s ? "on" : ""
                    }`}
                    title={s === "goal" ? "My goal (golden)" : STATUS_META[s].label}
                    onClick={() => {
                      onSetStatus(ctxMenu.id, s);
                      setCtxMenu(null);
                    }}
                  />
                ))}
              </div>
              <div className="node-menu-sep" />
            </>
          )}
          {ctxHasKids && (
            <button
              type="button"
              className="node-menu-item"
              onClick={() => {
                toggle(ctxMenu.id);
                setCtxMenu(null);
              }}
            >
              {isExpanded(ctxMenu.id) ? "Collapse" : "Expand"}
            </button>
          )}
          <button
            type="button"
            className="node-menu-item"
            onClick={() => addStep(ctxMenu.id)}
          >
            Add next step
          </button>
          <button
            type="button"
            className="node-menu-item"
            onClick={() => {
              const id = ctxMenu.id;
              setCtxMenu(null);
              onEditNode(id);
            }}
          >
            Edit…
          </button>
          <div className="node-menu-sep" />
          <button
            type="button"
            className="node-menu-item danger"
            onClick={() => {
              const id = ctxMenu.id;
              setCtxMenu(null);
              onDeleteNode(id);
            }}
          >
            Delete{ctxNode.title.trim() ? ` “${ctxNode.title.trim()}”` : ""}
          </button>
        </div>
      )}
    </div>
  );
}
