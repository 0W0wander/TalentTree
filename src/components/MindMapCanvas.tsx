"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { MapNode, MapEdge, NodeStatus, Spec, EdgeKind } from "@/lib/types";
import { HABIT_HUB_ID, isLabel, roleOf, isSideEdge } from "@/lib/types";
import { resolveIcon, isBgPreset } from "@/lib/presets";

type Size = { w: number; h: number };
type View = { x: number; y: number; scale: number };

const FALLBACK_SIZE: Size = { w: 176, h: 50 };

const ARROW_H = 10;
const ARROW_W = 6.5;

/** Orthogonal talent-tree pipe: down, across, down into the child. */
function elbowPath(fx: number, fy: number, tx: number, ty: number): string {
  const endY = ty - ARROW_H + 1;
  const gap = endY - fy;
  if (gap < 8 || Math.abs(tx - fx) < 8) {
    return `M ${fx} ${fy} L ${tx} ${endY}`;
  }
  const midY = fy + Math.min(Math.max(16, gap * 0.38), Math.max(16, gap - 12));
  return `M ${fx} ${fy} L ${fx} ${midY} L ${tx} ${midY} L ${tx} ${endY}`;
}

function arrowPoints(tx: number, ty: number): string {
  return `${tx},${ty} ${tx - ARROW_W},${ty - ARROW_H} ${tx + ARROW_W},${ty - ARROW_H}`;
}

/** Horizontal peer pipe: out, across, into the neighbour. */
function sidePath(fx: number, fy: number, tx: number, ty: number): string {
  const goingRight = tx >= fx;
  const endX = goingRight ? tx - ARROW_H + 1 : tx + ARROW_H - 1;
  if (Math.abs(ty - fy) < 8) {
    return `M ${fx} ${fy} L ${endX} ${ty}`;
  }
  const midX = fx + (endX - fx) * 0.5;
  return `M ${fx} ${fy} L ${midX} ${fy} L ${midX} ${ty} L ${endX} ${ty}`;
}

function arrowSide(tx: number, ty: number, fromLeft: boolean): string {
  if (fromLeft) {
    return `${tx},${ty} ${tx - ARROW_H},${ty - ARROW_W} ${tx - ARROW_H},${ty + ARROW_W}`;
  }
  return `${tx},${ty} ${tx + ARROW_H},${ty - ARROW_W} ${tx + ARROW_H},${ty + ARROW_W}`;
}

function iconSrc(node: MapNode): string {
  if (node.icon) return resolveIcon(node.icon);
  return "/assets/icon-sword.png";
}

function TitleEditor({
  title,
  onCommit,
  onCancel,
}: {
  title: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(title);
  const done = useRef(false);
  const selectOnFocus = useRef(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const arm = () => {
      el.focus({ preventScroll: true });
      el.select();
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    arm();
    const raf = requestAnimationFrame(arm);
    const t = window.setTimeout(arm, 30);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, []);

  function finish(next: string, cancel = false) {
    if (done.current) return;
    done.current = true;
    if (cancel) onCancel();
    else onCommit(next);
  }

  return (
    <textarea
      ref={ref}
      className="mm-title-input"
      value={value}
      rows={1}
      spellCheck={false}
      onChange={(e) => {
        setValue(e.target.value);
        const el = e.target;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }}
      onFocus={(e) => {
        if (selectOnFocus.current) {
          selectOnFocus.current = false;
          e.currentTarget.select();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          finish(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(value, true);
        }
      }}
      onBlur={() => finish(value)}
    />
  );
}

function SpecBackdrop({ spec }: { spec: Spec }) {
  return (
    <div
      className={
        !spec.background || isBgPreset(spec.background)
          ? `spec-frame-bg is-preset ${spec.background || "steel"}`
          : "spec-frame-bg"
      }
      style={
        spec.background && !isBgPreset(spec.background)
          ? { backgroundImage: `url("${spec.background}")` }
          : undefined
      }
    />
  );
}

function SpecHead({ spec }: { spec: Spec }) {
  return (
    <div className="spec-frame-head">
      <span className="tab-icon" style={{ width: 22, height: 22 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={resolveIcon(spec.icon)} alt="" />
      </span>
      <span>{spec.name}</span>
    </div>
  );
}

type Props = {
  nodes: MapNode[];
  edges: MapEdge[];
  editMode: boolean;
  onMoveNode: (id: string, x: number, y: number) => void;
  onEditNode: (id: string) => void;
  onRenameNode: (id: string, title: string) => void;
  onRequestTitleEdit: (id: string) => void;
  onCancelTitleEdit: () => void;
  titleEditId?: string | null;
  onConnect: (from: string, to: string, kind?: EdgeKind) => void;
  onCreateLinked: (from: string, x: number, y: number, kind?: EdgeKind) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
  specs?: Spec[];
  showSpecFrames?: boolean;
  /** Increment to re-frame the camera after a bulk layout. */
  viewEpoch?: number;
  /** Goals packs to the screen; other views keep text larger and pan. */
  frameMode?: "fit" | "initial";
};

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.5;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

type NodeHit = "icon" | "title" | "body";

type DragState =
  | { kind: "pan"; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | {
      kind: "node";
      id: string;
      sx: number;
      sy: number;
      ox: number;
      oy: number;
      moved: boolean;
      hit: NodeHit;
    }
  | null;

export default function MindMapCanvas({
  nodes,
  edges,
  editMode,
  onMoveNode,
  onEditNode,
  onRenameNode,
  onRequestTitleEdit,
  onCancelTitleEdit,
  titleEditId = null,
  onConnect,
  onCreateLinked,
  onDeleteNode,
  onDeleteEdge,
  specs = [],
  showSpecFrames = false,
  viewEpoch = 0,
  frameMode = "initial",
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef<DragState>(null);
  const [panning, setPanning] = useState(false);
  const didFit = useRef(false);
  const [link, setLink] = useState<{
    from: string;
    kind: EdgeKind;
    side?: "left" | "right";
    x: number;
    y: number;
    sx: number;
    sy: number;
  } | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const linkRef = useRef(link);
  linkRef.current = link;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;

  /* ---------------- measure node sizes ---------------- */
  const measure = useCallback(() => {
    setSizes((prev) => {
      let changed = false;
      const next: Record<string, Size> = { ...prev };
      nodeEls.current.forEach((el, id) => {
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        if (!prev[id] || prev[id].w !== w || prev[id].h !== h) {
          next[id] = { w, h };
          changed = true;
        }
      });
      // prune removed nodes
      for (const id of Object.keys(next)) {
        if (!nodeEls.current.has(id)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [nodes, measure]);

  useEffect(() => {
    const ro = new ResizeObserver(() => measure());
    nodeEls.current.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [nodes, measure]);

  const setNodeRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) nodeEls.current.set(id, el);
      else nodeEls.current.delete(id);
    },
    []
  );

  /* ---------------- view framing ---------------- */
  const applyView = useCallback(
    (mode: "fit" | "initial") => {
      const canvas = canvasRef.current;
      if (!canvas || nodes.length === 0) return;
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const n of nodes) {
        const s = sizes[n.id] ?? { w: 148, h: 36 };
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + s.w);
        maxY = Math.max(maxY, n.y + s.h);
      }
      const pad = 36;
      const fit = Math.min(
        (cw - pad * 2) / (maxX - minX),
        (ch - pad * 2) / (maxY - minY)
      );
      // "fit" shows everything; "initial" keeps text legible and lets the
      // user pan to the rest instead of shrinking the whole board.
      const scale =
        mode === "fit"
          ? clamp(fit, MIN_SCALE, 1.15)
          : clamp(fit, 0.78, 1.05);
      const sw = (maxX - minX) * scale;
      const sh = (maxY - minY) * scale;
      const x = sw < cw ? (cw - sw) / 2 - minX * scale : pad - minX * scale;
      const y = sh < ch ? (ch - sh) / 2 - minY * scale : pad - minY * scale;
      setView({ x, y, scale });
    },
    [nodes, sizes]
  );

  const fitView = useCallback(() => applyView("fit"), [applyView]);

  useEffect(() => {
    didFit.current = false;
  }, [viewEpoch]);

  useEffect(() => {
    if (didFit.current) return;
    if (nodes.length === 0) return;
    if (Object.keys(sizes).length < nodes.length) return;
    didFit.current = true;
    applyView(frameMode);
  }, [nodes, sizes, applyView, viewEpoch, frameMode]);

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

  function hitNode(wx: number, wy: number, skip?: string): string | null {
    const list = nodesRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      if (n.id === skip) continue;
      const s = sizesRef.current[n.id] ?? FALLBACK_SIZE;
      if (wx >= n.x - 8 && wx <= n.x + s.w + 8 && wy >= n.y - 14 && wy <= n.y + s.h + 14) {
        return n.id;
      }
    }
    return null;
  }

  /* ---------------- pointer: pan + drag + link ---------------- */
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const linking = linkRef.current;
      if (linking) {
        const w = clientToWorld(e.clientX, e.clientY);
        setLink({ ...linking, x: w.x, y: w.y });
        setDropId(hitNode(w.x, w.y, linking.from));
        return;
      }
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
      if (d.kind === "pan") {
        setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
      } else if (d.kind === "node") {
        const sc = viewRef.current.scale;
        onMoveNode(d.id, d.ox + dx / sc, d.oy + dy / sc);
      }
    }
    function onUp(e: PointerEvent) {
      const linking = linkRef.current;
      if (linking) {
        const w = clientToWorld(e.clientX, e.clientY);
        const over = hitNode(w.x, w.y);
        const dragged =
          Math.hypot(e.clientX - linking.sx, e.clientY - linking.sy) > 14;
        if (over && over !== linking.from) {
          finishConnect(linking.from, over, linking.kind);
        } else if (!over && dragged) {
          spawnLinked(linking.from, w.x, w.y, linking.kind);
        } else if (over === linking.from && dragged) {
          clearLink();
        }
        // Clicked the source without dragging: stay linking so a second
        // click can pick the target or drop a new box.
        drag.current = null;
        setPanning(false);
        return;
      }
      const d = drag.current;
      drag.current = null;
      setPanning(false);
      if (!d) return;
      if (!d.moved && d.kind === "node") {
        if (d.hit === "icon") onEditNode(d.id);
        else onRequestTitleEdit(d.id);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") clearLink();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [onMoveNode, onConnect, onCreateLinked, onEditNode, onRequestTitleEdit]);

  function onBackgroundPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if (linkRef.current) {
      const w = clientToWorld(e.clientX, e.clientY);
      spawnLinked(linkRef.current.from, w.x, w.y, linkRef.current.kind);
      return;
    }
    drag.current = {
      kind: "pan",
      sx: e.clientX,
      sy: e.clientY,
      ox: view.x,
      oy: view.y,
      moved: false,
    };
    setPanning(true);
  }

  function onNodeContextMenu(e: React.MouseEvent, node: MapNode) {
    e.preventDefault();
    e.stopPropagation();
    drag.current = null;
    setPanning(false);
    setCtxMenu({ id: node.id, x: e.clientX, y: e.clientY });
  }

  useEffect(() => {
    if (!ctxMenu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCtxMenu(null);
    }
    function onClose() {
      setCtxMenu(null);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onClose);
    window.addEventListener("wheel", onClose, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onClose);
      window.removeEventListener("wheel", onClose);
    };
  }, [ctxMenu]);

  function onNodePointerDown(
    e: React.PointerEvent,
    node: MapNode,
    hit: NodeHit = "body"
  ) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (linkRef.current) {
      const from = linkRef.current.from;
      if (from !== node.id) finishConnect(from, node.id, linkRef.current.kind);
      else clearLink();
      return;
    }
    if (titleEditId === node.id && hit === "title") return;
    drag.current = {
      kind: "node",
      id: node.id,
      sx: e.clientX,
      sy: e.clientY,
      ox: node.x,
      oy: node.y,
      moved: false,
      hit,
    };
  }

  function clearLink() {
    linkRef.current = null;
    setLink(null);
    setDropId(null);
  }

  function finishConnect(from: string, to: string, kind: EdgeKind = "down") {
    if (from !== to) onConnect(from, to, kind);
    clearLink();
  }

  function spawnLinked(
    from: string,
    wx: number,
    wy: number,
    kind: EdgeKind = "down"
  ) {
    onCreateLinked(from, wx, wy, kind);
    clearLink();
  }

  function startLink(
    e: React.PointerEvent,
    id: string,
    kind: EdgeKind,
    side?: "left" | "right"
  ) {
    e.stopPropagation();
    e.preventDefault();
    const w = clientToWorld(e.clientX, e.clientY);
    const next = {
      from: id,
      kind,
      side,
      x: w.x,
      y: w.y,
      sx: e.clientX,
      sy: e.clientY,
    };
    linkRef.current = next;
    setLink(next);
    setDropId(null);
    drag.current = null;
  }

  /* ---------------- wheel zoom (non-passive) ---------------- */
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

  /* ---------------- edge geometry ---------------- */
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const s = sizes[n.id] ?? FALLBACK_SIZE;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + s.w);
    maxY = Math.max(maxY, n.y + s.h);
  }
  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;
  if (!Number.isFinite(maxX)) maxX = 1;
  if (!Number.isFinite(maxY)) maxY = 1;
  const svgOx = minX - 80;
  const svgOy = minY - 80;
  const svgW = Math.max(2, maxX - minX + 160);
  const svgH = Math.max(2, maxY - minY + 160);

  type Drawn = {
    edge: MapEdge;
    d: string;
    status: NodeStatus;
    arrow: string;
  };
  const drawn: Drawn[] = [];
  for (const edge of edges) {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) continue;
    const fs = sizes[from.id] ?? FALLBACK_SIZE;
    const ts = sizes[to.id] ?? FALLBACK_SIZE;
    if (isSideEdge(edge)) {
      const fromRight = from.x + fs.w / 2 <= to.x + ts.w / 2;
      const fx = (fromRight ? from.x + fs.w : from.x) - svgOx;
      const fy = from.y + fs.h / 2 - svgOy;
      const tx = (fromRight ? to.x : to.x + ts.w) - svgOx;
      const ty = to.y + ts.h / 2 - svgOy;
      drawn.push({
        edge,
        d: sidePath(fx, fy, tx, ty),
        status: to.status,
        arrow: arrowSide(tx, ty, fromRight),
      });
    } else {
      const fx = from.x + fs.w / 2 - svgOx;
      const fy = from.y + fs.h - svgOy;
      const tx = to.x + ts.w / 2 - svgOx;
      const ty = to.y - svgOy;
      drawn.push({
        edge,
        d: elbowPath(fx, fy, tx, ty),
        status: to.status,
        arrow: arrowPoints(tx, ty),
      });
    }
  }

  let previewD: string | null = null;
  let previewArrow: string | null = null;
  let ghost: { x: number; y: number; label: string } | null = null;
  if (link) {
    const from = nodeById.get(link.from);
    if (from) {
      const fs = sizes[from.id] ?? FALLBACK_SIZE;
      const tx = link.x - svgOx;
      const ty = link.y - svgOy;
      if (link.kind === "side") {
        const fromRight = link.side
          ? link.side === "right"
          : link.x >= from.x + fs.w / 2;
        const fx = (fromRight ? from.x + fs.w : from.x) - svgOx;
        const fy = from.y + fs.h / 2 - svgOy;
        previewD = sidePath(fx, fy, tx, ty);
        previewArrow = arrowSide(tx, ty, fromRight);
        if (!dropId) {
          const dist = Math.abs(link.x - (from.x + fs.w / 2));
          if (dist > 48) {
            ghost = {
              x: link.x - FALLBACK_SIZE.w / 2,
              y: from.y,
              label:
                roleOf(from) === "group"
                  ? "New Group"
                  : roleOf(from) === "subgroup"
                    ? "New Subgroup"
                    : roleOf(from) === "set"
                      ? "New Set"
                      : "New Box",
            };
          }
        }
      } else {
        const fx = from.x + fs.w / 2 - svgOx;
        const fy = from.y + fs.h - svgOy;
        previewD = elbowPath(fx, fy, tx, ty);
        previewArrow = arrowPoints(tx, ty);
        if (!dropId) {
          const dist = Math.hypot(
            link.x - (from.x + fs.w / 2),
            link.y - (from.y + fs.h)
          );
          if (dist > 48) {
            ghost = {
              x: link.x - FALLBACK_SIZE.w / 2,
              y: link.y,
              label: from.id === HABIT_HUB_ID ? "New Subgroup" : "New Box",
            };
          }
        }
      }
    }
  }

  const visibleSpecIds = [
    ...new Set(
      nodes
        .map((n) => n.specId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  const bleedSpec =
    showSpecFrames && visibleSpecIds.length === 1
      ? specs.find((s) => s.id === visibleSpecIds[0])
      : undefined;
  const ctxNode = ctxMenu
    ? nodes.find((n) => n.id === ctxMenu.id)
    : undefined;

  return (
    <div
      ref={canvasRef}
      className={`mm-canvas ${panning ? "is-panning" : ""} ${
        link
          ? `is-connecting ${
              link.kind === "side" ? "is-connecting-side" : "is-connecting-down"
            }`
          : ""
      }`}
      onPointerDown={onBackgroundPointerDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {bleedSpec && (
        <div
          className="spec-bleed"
          style={{ ["--accent" as string]: bleedSpec.accent }}
        >
          <SpecBackdrop spec={bleedSpec} />
          <SpecHead spec={bleedSpec} />
        </div>
      )}
      <div
        className="mm-world"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}
      >
        {showSpecFrames &&
          !bleedSpec &&
          specs.map((spec) => {
            const members = nodes.filter((n) => n.specId === spec.id);
            if (members.length === 0) return null;
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const n of members) {
              const s = sizes[n.id] ?? FALLBACK_SIZE;
              minX = Math.min(minX, n.x);
              minY = Math.min(minY, n.y);
              maxX = Math.max(maxX, n.x + s.w);
              maxY = Math.max(maxY, n.y + s.h);
            }
            if (!Number.isFinite(minX)) return null;
            const padX = 24;
            const padTop = 44;
            const padBot = 22;
            return (
              <div
                key={`frame-${spec.id}`}
                className="spec-frame"
                style={{
                  left: minX - padX,
                  top: minY - padTop,
                  width: maxX - minX + padX * 2,
                  height: maxY - minY + padTop + padBot,
                  ["--accent" as string]: spec.accent,
                }}
              >
                <SpecBackdrop spec={spec} />
                <SpecHead spec={spec} />
              </div>
            );
          })}

        {/* branches */}
        <svg
          className="mm-edges"
          style={{ left: svgOx, top: svgOy }}
          width={svgW}
          height={svgH}
        >
          {drawn.map(({ edge, d, status, arrow }) => (
            <g key={edge.id}>
              <path className="mm-edge under" d={d} />
              <path className="mm-edge pipe" d={d} />
              <path className={`mm-edge ${status}`} d={d} />
              <polygon className={`mm-arrow ${status}`} points={arrow} />
              <path
                className="mm-edge hit"
                d={d}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteEdge(edge.id);
                }}
              >
                <title>Click to remove this branch</title>
              </path>
            </g>
          ))}
          {previewD && (
            <g>
              <path className="mm-edge under" d={previewD} />
              <path className="mm-edge pipe" d={previewD} />
              <path className="mm-edge preview" d={previewD} />
              {previewArrow && (
                <polygon className="mm-arrow preview" points={previewArrow} />
              )}
            </g>
          )}
        </svg>

        {/* nodes */}
        {nodes.map((node) => {
          const isDragging =
            drag.current?.kind === "node" && drag.current.id === node.id;
          const role = roleOf(node);
          const cls = [
            "mm-node",
            isLabel(node) ? "" : node.status,
            role === "group" ? "group" : "",
            role === "subgroup" ? "subgroup" : "",
            role === "set" ? "set" : "",
            editMode ? "edit-mode" : "",
            isDragging ? "dragging" : "",
            link?.from === node.id ? "linking-from selected" : "",
            dropId === node.id ? "drop-target" : "",
            titleEditId === node.id ? "renaming" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={node.id}
              ref={setNodeRef(node.id)}
              className={cls}
              style={{
                left: node.x,
                top: node.y,
              }}
              onPointerDown={(e) => onNodePointerDown(e, node, "body")}
              onContextMenu={(e) => onNodeContextMenu(e, node)}
            >
              <div className="mm-plate">
                {!isLabel(node) && (
                  <span
                    className="mm-icon"
                    title="Edit box"
                    onPointerDown={(e) => onNodePointerDown(e, node, "icon")}
                  >
                    <span className="slot-inner">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={iconSrc(node)}
                        alt=""
                        draggable={false}
                      />
                    </span>
                  </span>
                )}
                <div
                  className="mm-copy"
                  onPointerDown={(e) => onNodePointerDown(e, node, "title")}
                >
                  {titleEditId === node.id ? (
                    <TitleEditor
                      title={node.title || ""}
                      onCommit={(value) => onRenameNode(node.id, value)}
                      onCancel={onCancelTitleEdit}
                    />
                  ) : (
                    <span className="mm-title">{node.title || "Untitled"}</span>
                  )}
                  {node.note && titleEditId !== node.id ? (
                    <div className="mm-note">{node.note}</div>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="mm-port out down"
                title="Drag down to connect a child, or onto empty space for a new box"
                onPointerDown={(e) => startLink(e, node.id, "down")}
              />
              <button
                type="button"
                className="mm-port out side left"
                title="Drag sideways to connect a peer at the same grouping"
                onPointerDown={(e) => startLink(e, node.id, "side", "left")}
              />
              <button
                type="button"
                className="mm-port out side right"
                title="Drag sideways to connect a peer at the same grouping"
                onPointerDown={(e) => startLink(e, node.id, "side", "right")}
              />
              {link && link.from !== node.id && link.kind === "down" && (
                <button
                  type="button"
                  className="mm-port in down"
                  title="Drop here to connect as a child"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    finishConnect(link.from, node.id, "down");
                  }}
                />
              )}
              {link && link.from !== node.id && link.kind === "side" && (
                <>
                  <button
                    type="button"
                    className="mm-port in side left"
                    title="Drop here to connect as a peer"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      finishConnect(link.from, node.id, "side");
                    }}
                  />
                  <button
                    type="button"
                    className="mm-port in side right"
                    title="Drop here to connect as a peer"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      finishConnect(link.from, node.id, "side");
                    }}
                  />
                </>
              )}
            </div>
          );
        })}
        {ghost && (
          <div
            className="mm-ghost"
            style={{ left: ghost.x, top: ghost.y }}
          >
            {ghost.label}
          </div>
        )}
      </div>

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
          onClick={fitView}
          title="Fit everything to view"
        >
          ⤢
        </button>
      </div>

      <div className="absolute bottom-3 left-3 z-30 text-[11px] text-[#8b909b] pointer-events-none">
        {Math.round(view.scale * 100)}%
      </div>

      {ctxMenu && (
        <div
          className="node-menu steel-panel gold-trim"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="node-menu-item danger"
            onClick={() => {
              const id = ctxMenu.id;
              setCtxMenu(null);
              onDeleteNode(id);
            }}
          >
            Delete{ctxNode?.title.trim() ? ` “${ctxNode.title.trim()}”` : ""}
          </button>
        </div>
      )}
    </div>
  );
}
