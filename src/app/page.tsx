"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { MindMap, MapNode, NodeRole, Spec, EdgeKind } from "@/lib/types";
import { ALL_SPECS, GOALS_VIEW, isLabel, isSideEdge, isVirtualSpec, roleOf } from "@/lib/types";
import {
  ACCENT_PRESETS,
  createDefaultMap,
  ICON_PRESETS,
  newId,
  pickUnusedIcon,
  resolveIcon,
  withUniqueIcons,
} from "@/lib/presets";
import { loadState, saveState, exportState, importState } from "@/lib/storage";
import { organizeMap } from "@/lib/layout";
import {
  moveSubtreeToSpec,
  specProgress,
  connectAsPeers,
  buildGoalsView,
  unfinishedGoalCount,
  goalsViewSourceId,
  GOALS_SPEC,
} from "@/lib/specs";
import MindMapCanvas from "@/components/MindMapCanvas";
import NodeEditorModal from "@/components/NodeEditorModal";
import SpecEditorModal from "@/components/SpecEditorModal";

type EditTarget = { node: MapNode; isNew: boolean } | null;

export default function Page() {
  const [map, setMap] = useState<MindMap>(() => createDefaultMap());
  const [loaded, setLoaded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [target, setTarget] = useState<EditTarget>(null);
  const [specTarget, setSpecTarget] = useState<Spec | null>(null);
  const [viewEpoch, setViewEpoch] = useState(0);
  const [titleEditId, setTitleEditId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const specScrollRef = useRef<HTMLDivElement>(null);
  const dragSpecIdRef = useRef<string | null>(null);
  const skipSpecClickRef = useRef(false);
  const [draggingSpecId, setDraggingSpecId] = useState<string | null>(null);
  const [dragOverSpecKey, setDragOverSpecKey] = useState<string | null>(null);
  const [boardW, setBoardW] = useState(1760);

  // Load persisted map only on the client to avoid hydration mismatch.
  useEffect(() => {
    setMap(loadState());
    setLoaded(true);
    setViewEpoch((n) => n + 1);
  }, []);

  useEffect(() => {
    if (loaded) saveState(map);
  }, [map, loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (map.nodes.every((n) => isLabel(n) || n.icon)) return;
    setMap((m) => ({ ...m, nodes: withUniqueIcons(m.nodes) }));
  }, [loaded, map.nodes]);

  useEffect(() => {
    const flush = () => saveState(map);
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [map]);

  useEffect(() => {
    if (!loaded) return;
    const scroller = specScrollRef.current;
    if (!scroller) return;
    function onWheel(e: WheelEvent) {
      const el = specScrollRef.current;
      if (!el) return;
      if (el.scrollWidth <= el.clientWidth) return;
      if (e.deltaY === 0 && e.deltaX === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY + e.deltaX;
    }
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [loaded]);

  useEffect(() => {
    function measure() {
      setBoardW(Math.max(640, window.innerWidth - 32));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (map.activeSpecId !== GOALS_VIEW) return;
    setViewEpoch((n) => n + 1);
  }, [boardW, map.activeSpecId]);

  const isGoalsView = map.activeSpecId === GOALS_VIEW;
  const goalCount = unfinishedGoalCount(map);
  const goalsView = useMemo(
    () =>
      map.activeSpecId === GOALS_VIEW ? buildGoalsView(map, boardW) : null,
    [map, boardW]
  );

  const visibleNodes = useMemo(() => {
    if (map.activeSpecId === ALL_SPECS) return map.nodes;
    if (goalsView) return goalsView.nodes;
    return map.nodes.filter((n) => n.specId === map.activeSpecId);
  }, [map, map.activeSpecId, goalsView]);

  const visibleEdges = useMemo(() => {
    if (goalsView) return goalsView.edges;
    const ids = new Set(visibleNodes.map((n) => n.id));
    return map.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  }, [map.edges, visibleNodes, goalsView]);

  const specs = map.specs ?? [];

  /* ---------------- node ops ---------------- */
  function moveNode(id: string, x: number, y: number) {
    if (map.activeSpecId === GOALS_VIEW) return;
    setMap((m) => ({
      ...m,
      nodes: m.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
    }));
  }

  function openEditNode(id: string) {
    setTitleEditId(null);
    const node = map.nodes.find((n) => n.id === goalsViewSourceId(id));
    if (node) setTarget({ node, isNew: false });
  }

  function renameNode(id: string, title: string) {
    const src = goalsViewSourceId(id);
    const clean = title.trim() || "Untitled";
    setMap((m) => ({
      ...m,
      nodes: m.nodes.map((n) => (n.id === src ? { ...n, title: clean } : n)),
    }));
    setTitleEditId(null);
  }

  function saveNode(node: MapNode) {
    setMap((m) => {
      const prev = m.nodes.find((n) => n.id === node.id);
      let next = m;
      if (
        prev &&
        node.specId &&
        prev.specId !== node.specId &&
        !isVirtualSpec(node.specId)
      ) {
        next = moveSubtreeToSpec(next, node.id, node.specId);
      }
      const specId = node.specId === GOALS_VIEW ? prev?.specId : node.specId;
      const exists = next.nodes.some((n) => n.id === node.id);
      const saved: MapNode = {
        ...node,
        specId: specId ?? prev?.specId ?? next.specs[0]?.id,
        icon:
          isLabel(node) || node.icon
            ? node.icon
            : pickUnusedIcon(
                next.nodes.filter((n) => n.id !== node.id).map((n) => n.icon)
              ),
      };
      return {
        ...next,
        nodes: exists
          ? next.nodes.map((n) => (n.id === node.id ? { ...n, ...saved } : n))
          : [...next.nodes, saved],
      };
    });
    setTarget(null);
  }

  function deleteNode(id: string) {
    const src = goalsViewSourceId(id);
    setMap((m) => ({
      ...m,
      nodes: m.nodes.filter((n) => n.id !== src),
      edges: m.edges.filter((e) => e.from !== src && e.to !== src),
    }));
    setTarget(null);
    setTitleEditId((cur) => (cur === id || cur === src ? null : cur));
  }

  function addNode(role: NodeRole = "item") {
    const titles: Record<NodeRole, string> = {
      item: "New Box",
      group: "New Group",
      subgroup: "New Subgroup",
    };
    const specId = isVirtualSpec(map.activeSpecId)
      ? map.specs[0]?.id
      : map.activeSpecId;
    const node: MapNode = {
      id: newId("n"),
      title: titles[role],
      status: "neutral",
      role,
      specId,
      icon: role === "item" ? pickUnusedIcon(map.nodes.map((n) => n.icon)) : undefined,
      x: 80 + Math.round(Math.random() * 80),
      y: 80 + Math.round(Math.random() * 80),
    };
    setMap((m) => ({
      ...m,
      nodes: [...m.nodes, node],
      activeSpecId:
        m.activeSpecId === GOALS_VIEW ? ALL_SPECS : m.activeSpecId,
    }));
    setTitleEditId(node.id);
  }

  function organize() {
    setMap((m) => organizeMap(m));
    setViewEpoch((n) => n + 1);
  }

  function selectSpec(id: string) {
    setMap((m) => ({ ...m, activeSpecId: id }));
    setViewEpoch((n) => n + 1);
  }

  /** Reorder a real specialization among the tab strip (All / Goals stay pinned). */
  function moveSpecTo(
    dragId: string,
    target: string | "start" | "end",
    place: "before" | "after" = "before"
  ) {
    setMap((m) => {
      const from = m.specs.findIndex((s) => s.id === dragId);
      if (from < 0) return m;
      const specs = [...m.specs];
      const [item] = specs.splice(from, 1);
      let to: number;
      if (target === "start") to = 0;
      else if (target === "end") to = specs.length;
      else {
        to = specs.findIndex((s) => s.id === target);
        if (to < 0) return m;
        if (place === "after") to += 1;
      }
      specs.splice(to, 0, item);
      const unchanged = specs.every((s, i) => s.id === m.specs[i]?.id);
      return unchanged ? m : { ...m, specs };
    });
  }

  function onSpecDragStart(e: DragEvent, id: string) {
    dragSpecIdRef.current = id;
    setDraggingSpecId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    // Avoid the browser treating the click that ends a drag as a select.
    skipSpecClickRef.current = false;
  }

  function onSpecDragEnd() {
    dragSpecIdRef.current = null;
    setDraggingSpecId(null);
    setDragOverSpecKey(null);
  }

  function onSpecDragOver(e: DragEvent, key: string) {
    if (!dragSpecIdRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverSpecKey !== key) setDragOverSpecKey(key);
  }

  function onSpecDrop(e: DragEvent, target: string | "start" | "end") {
    e.preventDefault();
    const dragId = dragSpecIdRef.current ?? e.dataTransfer.getData("text/plain");
    setDragOverSpecKey(null);
    setDraggingSpecId(null);
    dragSpecIdRef.current = null;
    if (!dragId) return;
    if (target !== "start" && target !== "end" && target === dragId) return;
    let place: "before" | "after" = "before";
    if (target !== "start" && target !== "end") {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      if (e.clientX > rect.left + rect.width / 2) place = "after";
    }
    moveSpecTo(dragId, target, place);
    skipSpecClickRef.current = true;
  }

  function onSpecTabClick(id: string) {
    if (skipSpecClickRef.current) {
      skipSpecClickRef.current = false;
      return;
    }
    selectSpec(id);
  }

  function addSpec() {
    const spec: Spec = {
      id: newId("spec"),
      name: "New Spec",
      icon: ICON_PRESETS[map.specs.length % ICON_PRESETS.length].key,
      accent: ACCENT_PRESETS[map.specs.length % ACCENT_PRESETS.length],
      background: "steel",
    };
    const group: MapNode = {
      id: newId("n"),
      title: spec.name,
      status: "neutral",
      role: "group",
      specId: spec.id,
      x: 40,
      y: 40,
    };
    setMap((m) => ({
      ...m,
      specs: [...m.specs, spec],
      activeSpecId: spec.id,
      nodes: [...m.nodes, group],
    }));
    setViewEpoch((n) => n + 1);
    setSpecTarget(spec);
  }

  function saveSpec(spec: Spec) {
    setMap((m) => ({
      ...m,
      specs: m.specs.map((s) => (s.id === spec.id ? spec : s)),
    }));
    setSpecTarget(null);
  }

  function deleteSpec(id: string) {
    setMap((m) => {
      if (m.specs.length <= 1) return m;
      const specs = m.specs.filter((s) => s.id !== id);
      const fallback = specs[0].id;
      return {
        ...m,
        specs,
        activeSpecId: m.activeSpecId === id ? ALL_SPECS : m.activeSpecId,
        nodes: m.nodes.map((n) =>
          n.specId === id ? { ...n, specId: fallback } : n
        ),
      };
    });
    setSpecTarget(null);
    setViewEpoch((n) => n + 1);
  }

  /* ---------------- edge ops ---------------- */
  function connectNodes(from: string, to: string, kind: EdgeKind = "down") {
    if (from === to) return;
    if (kind === "side") {
      setMap((m) => connectAsPeers(m, from, to));
      return;
    }
    setMap((m) => {
      const source = m.nodes.find((n) => n.id === from);
      let next = m;
      if (source?.specId) {
        next = moveSubtreeToSpec(next, to, source.specId);
      }
      const dup = next.edges.some(
        (e) => !isSideEdge(e) && e.from === from && e.to === to
      );
      if (dup) return next;
      return {
        ...next,
        edges: [...next.edges, { id: newId("e"), from, to, kind: "down" }],
      };
    });
  }

  function createLinkedBox(
    fromId: string,
    x: number,
    y: number,
    kind: EdgeKind = "down"
  ) {
    const from = map.nodes.find((n) => n.id === fromId);
    const w = 196;
    const role: NodeRole =
      kind === "side" && from ? roleOf(from) : "item";
    const titles: Record<NodeRole, string> = {
      item: "New Box",
      group: "New Group",
      subgroup: "New Subgroup",
    };
    const node: MapNode = {
      id: newId("n"),
      title: titles[role],
      status: "neutral",
      role,
      icon: role === "item" ? pickUnusedIcon(map.nodes.map((n) => n.icon)) : undefined,
      specId:
        from?.specId && from.specId !== GOALS_VIEW
          ? from.specId
          : isVirtualSpec(map.activeSpecId)
            ? map.specs[0]?.id
            : map.activeSpecId,
      x: Math.round(
        map.activeSpecId === GOALS_VIEW && from
          ? from.x + (kind === "side" ? 224 : 0)
          : x - w / 2
      ),
      y: Math.round(
        map.activeSpecId === GOALS_VIEW && from
          ? from.y + (kind === "side" ? 0 : 100)
          : kind === "side" && from
            ? from.y
            : y
      ),
    };
    setMap((m) => {
      const edges = [
        ...m.edges,
        { id: newId("e"), from: fromId, to: node.id, kind },
      ];
      if (kind === "side") {
        const parent = m.edges.find(
          (e) => !isSideEdge(e) && e.to === fromId
        );
        if (parent) {
          edges.push({
            id: newId("e"),
            from: parent.from,
            to: node.id,
            kind: "down",
          });
        }
      }
      return {
        ...m,
        nodes: [...m.nodes, node],
        edges,
      };
    });
    setTitleEditId(node.id);
  }

  function deleteEdge(id: string) {
    setMap((m) => ({ ...m, edges: m.edges.filter((e) => e.id !== id) }));
  }

  /* ---------------- import / export ---------------- */
  function doExport() {
    const blob = new Blob([exportState(map)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${map.title.replace(/\s+/g, "-").toLowerCase() || "talent-tree"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setMap(importState(String(reader.result)));
      } catch {
        alert("That file is not a valid talent tree.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  if (!loaded) {
    return (
      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/dragon-crest.png"
          alt=""
          className="ornament w-[280px] max-w-[70vw] animate-pulse"
        />
        <div className="font-title gold-text text-2xl tracking-widest">
          Forging…
        </div>
      </main>
    );
  }

  const hint = editMode
    ? "Drag boxes to arrange · bottom dot = child, side dots = same group · drop on empty space for a new box · click a branch to remove it."
    : "Hover a box — bottom dot connects a child, side dots connect a peer. Click the title to rename, click the icon to edit, right-click to delete. Drag a spec tab to reorder.";

  return (
    <main className="relative z-10 h-screen flex flex-col overflow-hidden">
      <header className="steel-panel app-header" title={hint}>
        <div className="app-left">
          <nav className="app-icons" aria-label="Board tools">
            <IconBtn
              title={editMode ? "Editing — click to lock layout" : "Edit layout"}
              on={editMode}
              onClick={() => setEditMode((v) => !v)}
            >
              <PencilIcon />
            </IconBtn>
            <IconBtn title="Add box" onClick={() => addNode("item")}>
              <BoxIcon />
            </IconBtn>
            <IconBtn title="Add group" onClick={() => addNode("group")}>
              <GroupIcon />
            </IconBtn>
            <IconBtn title="Add subgroup" onClick={() => addNode("subgroup")}>
              <SubgroupIcon />
            </IconBtn>
            <span className="icon-rule" />
            <IconBtn title="Organize" onClick={organize}>
              <OrganizeIcon />
            </IconBtn>
            <IconBtn title="Export" onClick={doExport}>
              <ExportIcon />
            </IconBtn>
            <IconBtn
              title="Import"
              onClick={() => fileRef.current?.click()}
            >
              <ImportIcon />
            </IconBtn>
            <IconBtn
              title="Reset to default tree"
              onClick={() => {
                if (
                  confirm(
                    "Reset to the default life talent tree? Your current board will be lost."
                  )
                ) {
                  setMap(createDefaultMap());
                  setViewEpoch((n) => n + 1);
                }
              }}
            >
              <ResetIcon />
            </IconBtn>
          </nav>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/dragon-crest.png"
            alt=""
            className="ornament w-4 h-4 object-contain select-none flex-none"
          />
          <input
            value={map.title}
            onChange={(e) => setMap((m) => ({ ...m, title: e.target.value }))}
            className="font-title gold-text text-[11px] tracking-wide bg-transparent outline-none w-[132px] min-w-0 shrink"
            spellCheck={false}
          />
        </div>

        <div ref={specScrollRef} className="app-specs">
          <button
            type="button"
            className={`spec-tab ${map.activeSpecId === ALL_SPECS ? "active" : ""}${
              dragOverSpecKey === "start" ? " drag-over" : ""
            }`}
            onClick={() => selectSpec(ALL_SPECS)}
            onDragOver={(e) => onSpecDragOver(e, "start")}
            onDragLeave={() => {
              if (dragOverSpecKey === "start") setDragOverSpecKey(null);
            }}
            onDrop={(e) => onSpecDrop(e, "start")}
            title="Show every specialization — drop a spec here to put it first"
          >
            <span>All</span>
            <span className="tab-points">
              {map.nodes.filter((n) => !isLabel(n)).length}
            </span>
          </button>
          <button
            type="button"
            className={`spec-tab goals ${isGoalsView ? "active" : ""}`}
            onClick={() => selectSpec(GOALS_VIEW)}
            title="Unfinished goals under the nearest group or subgroup"
            style={
              isGoalsView
                ? { ["--accent" as string]: GOALS_SPEC.accent }
                : undefined
            }
          >
            <div className="tab-icon">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolveIcon(GOALS_SPEC.icon)} alt="" />
            </div>
            <span>Goals</span>
            <span className="tab-points">{goalCount}</span>
          </button>
          {specs.map((spec) => {
            const p = specProgress(map, spec.id);
            const isDragging = draggingSpecId === spec.id;
            const isOver = dragOverSpecKey === spec.id;
            return (
              <button
                type="button"
                key={spec.id}
                draggable
                className={`spec-tab${map.activeSpecId === spec.id ? " active" : ""}${
                  isDragging ? " dragging" : ""
                }${isOver ? " drag-over" : ""}`}
                style={
                  map.activeSpecId === spec.id
                    ? { ["--accent" as string]: spec.accent }
                    : undefined
                }
                onClick={() => onSpecTabClick(spec.id)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  setSpecTarget(spec);
                }}
                onDragStart={(e) => onSpecDragStart(e, spec.id)}
                onDragEnd={onSpecDragEnd}
                onDragOver={(e) => onSpecDragOver(e, spec.id)}
                onDragLeave={() => {
                  if (dragOverSpecKey === spec.id) setDragOverSpecKey(null);
                }}
                onDrop={(e) => onSpecDrop(e, spec.id)}
                title={`${spec.name} — drag to reorder, double-click to edit`}
              >
                <div className="tab-icon">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resolveIcon(spec.icon)} alt="" draggable={false} />
                </div>
                <span>{spec.name}</span>
                <span className="tab-points">
                  {p.done}/{p.total}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            className={`spec-tab${dragOverSpecKey === "end" ? " drag-over" : ""}`}
            onClick={addSpec}
            onDragOver={(e) => onSpecDragOver(e, "end")}
            onDragLeave={() => {
              if (dragOverSpecKey === "end") setDragOverSpecKey(null);
            }}
            onDrop={(e) => onSpecDrop(e, "end")}
            title="Add a specialization — drop a spec here to move it last"
            style={{ color: "var(--gold)" }}
          >
            +
          </button>
        </div>
      </header>

      <section className="steel-panel gold-trim rivets app-board">
        <span className="rivet-b" />
        <span className="rivet-c" />
        <MindMapCanvas
          nodes={visibleNodes}
          edges={visibleEdges}
          editMode={editMode && !isGoalsView}
          onMoveNode={moveNode}
          onEditNode={openEditNode}
          onRenameNode={renameNode}
          onRequestTitleEdit={setTitleEditId}
          onCancelTitleEdit={() => setTitleEditId(null)}
          titleEditId={titleEditId}
          onConnect={connectNodes}
          onCreateLinked={createLinkedBox}
          onDeleteNode={deleteNode}
          onDeleteEdge={deleteEdge}
          specs={isGoalsView ? [GOALS_SPEC] : specs}
          showSpecFrames={true}
          viewEpoch={viewEpoch}
          frameMode={isGoalsView ? "fit" : "initial"}
        />
      </section>

      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={onImportFile}
      />

      {target && (
        <NodeEditorModal
          draft={target.node}
          isNew={target.isNew}
          specs={specs}
          onSave={saveNode}
          onDelete={deleteNode}
          onClose={() => setTarget(null)}
        />
      )}
      {specTarget && (
        <SpecEditorModal
          spec={specTarget}
          canDelete={specs.length > 1}
          onSave={saveSpec}
          onDelete={deleteSpec}
          onClose={() => setSpecTarget(null)}
        />
      )}
    </main>
  );
}

function IconBtn({
  title,
  on,
  onClick,
  children,
}: {
  title: string;
  on?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`btn-icon ${on ? "is-on" : ""}`}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Ico({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function PencilIcon() {
  return (
    <Ico>
      <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" />
      <path d="M10 4l2 2" />
    </Ico>
  );
}

function BoxIcon() {
  return (
    <Ico>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.2" />
      <path d="M8 5.5v5M5.5 8h5" />
    </Ico>
  );
}

function GroupIcon() {
  return (
    <Ico>
      <rect x="2" y="3.5" width="8" height="6.5" rx="1" />
      <rect x="6" y="6.5" width="8" height="6.5" rx="1" />
    </Ico>
  );
}

function SubgroupIcon() {
  return (
    <Ico>
      <rect x="2" y="2.5" width="12" height="11" rx="1.2" />
      <rect x="4.5" y="6" width="7" height="5" rx="0.8" />
    </Ico>
  );
}

function OrganizeIcon() {
  return (
    <Ico>
      <rect x="2.5" y="2.5" width="4" height="4" rx="0.6" />
      <rect x="9.5" y="2.5" width="4" height="4" rx="0.6" />
      <rect x="2.5" y="9.5" width="4" height="4" rx="0.6" />
      <rect x="9.5" y="9.5" width="4" height="4" rx="0.6" />
    </Ico>
  );
}

function ExportIcon() {
  return (
    <Ico>
      <path d="M8 3.5v7" />
      <path d="M5 6l3-3 3 3" />
      <path d="M3.5 12.5h9" />
    </Ico>
  );
}

function ImportIcon() {
  return (
    <Ico>
      <path d="M8 3.5v7" />
      <path d="M5 8.5l3 3 3-3" />
      <path d="M3.5 12.5h9" />
    </Ico>
  );
}

function ResetIcon() {
  return (
    <Ico>
      <path d="M3.5 8a4.5 4.5 0 1 0 1.3-3.2" />
      <path d="M3.5 3.5v3h3" />
    </Ico>
  );
}
