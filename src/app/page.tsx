"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MindMap, MapNode, NodeRole, EdgeKind } from "@/lib/types";
import { ROOT_ID, ROOT_VIEW, isLabel, roleOf } from "@/lib/types";
import {
  createDefaultMap,
  newId,
  pickUnusedIcon,
  resolveIcon,
  withUniqueIcons,
} from "@/lib/presets";
import { loadState, saveState, exportState, importState } from "@/lib/storage";
import { organizeMap } from "@/lib/layout";
import { buildAiPrompt } from "@/lib/outline";
import { connectAsPeers, subtreeIds } from "@/lib/specs";
import MindMapCanvas from "@/components/MindMapCanvas";
import NodeEditorModal from "@/components/NodeEditorModal";
import AiPromptModal from "@/components/AiPromptModal";

type EditTarget = { node: MapNode; isNew: boolean } | null;

export default function Page() {
  const [map, setMap] = useState<MindMap>(() => createDefaultMap());
  const [loaded, setLoaded] = useState(false);
  const [target, setTarget] = useState<EditTarget>(null);
  const [viewEpoch, setViewEpoch] = useState(0);
  const [titleEditId, setTitleEditId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState<string | null>(null);
  const [controlsStacked, setControlsStacked] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const specsRef = useRef<HTMLDivElement>(null);

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
    if (!settingsOpen) return;
    function onDown(e: MouseEvent) {
      if (!settingsRef.current?.contains(e.target as Node)) setSettingsOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSettingsOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen]);

  const pinnedNodes = useMemo(
    () => map.nodes.filter((n) => n.pinned && n.id !== ROOT_ID),
    [map.nodes]
  );

  // When the spec chips can't fit on one row beside the controls, drop the
  // controls onto their own row below the wrapped chips. Measured from the
  // chips' intrinsic widths so it never oscillates as the layout reflows.
  useEffect(() => {
    if (!loaded) return;
    const CHIP_GAP = 4;
    const CONTROLS_RESERVE = 78; // Organize + gear icons, gaps and breathing room
    function recompute() {
      const header = headerRef.current;
      const specs = specsRef.current;
      if (!header || !specs) return;
      const chips = Array.from(specs.children) as HTMLElement[];
      let chipsWidth = 0;
      for (const c of chips) chipsWidth += c.offsetWidth;
      chipsWidth += CHIP_GAP * Math.max(0, chips.length - 1);
      const cs = getComputedStyle(header);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const available = header.clientWidth - padX;
      setControlsStacked(chipsWidth > available - CONTROLS_RESERVE);
    }
    recompute();
    const header = headerRef.current;
    const ro = new ResizeObserver(recompute);
    if (header) ro.observe(header);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [loaded, pinnedNodes, map.title]);

  const focusIds = useMemo(
    () =>
      map.activeView === ROOT_VIEW
        ? null
        : subtreeIds(map.activeView, map.edges),
    [map.activeView, map.edges]
  );

  const visibleNodes = useMemo(
    () => (focusIds ? map.nodes.filter((n) => focusIds.has(n.id)) : map.nodes),
    [map.nodes, focusIds]
  );

  const visibleEdges = useMemo(() => {
    const ids = new Set(visibleNodes.map((n) => n.id));
    return map.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  }, [map.edges, visibleNodes]);

  /* ---------------- node ops ---------------- */
  function moveNode(id: string, x: number, y: number) {
    setMap((m) => ({
      ...m,
      nodes: m.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
    }));
  }

  function openEditNode(id: string) {
    setTitleEditId(null);
    const node = map.nodes.find((n) => n.id === id);
    if (node) setTarget({ node, isNew: false });
  }

  function renameNode(id: string, title: string) {
    const clean = title.trim() || "Untitled";
    setMap((m) => ({
      ...m,
      title: id === ROOT_ID ? clean : m.title,
      nodes: m.nodes.map((n) => (n.id === id ? { ...n, title: clean } : n)),
    }));
    setTitleEditId(null);
  }

  function saveNode(node: MapNode) {
    setMap((m) => {
      const exists = m.nodes.some((n) => n.id === node.id);
      const saved: MapNode = {
        ...node,
        icon:
          isLabel(node) || node.icon
            ? node.icon
            : pickUnusedIcon(
                m.nodes.filter((n) => n.id !== node.id).map((n) => n.icon)
              ),
      };
      return {
        ...m,
        title: node.id === ROOT_ID ? saved.title : m.title,
        nodes: exists
          ? m.nodes.map((n) => (n.id === node.id ? { ...n, ...saved } : n))
          : [...m.nodes, saved],
      };
    });
    setTarget(null);
  }

  function deleteNode(id: string) {
    if (id === ROOT_ID) return;
    setMap((m) => {
      const parentId =
        m.edges.find((e) => e.kind !== "side" && e.to === id)?.from ?? ROOT_ID;
      const childIds = m.edges
        .filter((e) => e.kind !== "side" && e.from === id)
        .map((e) => e.to);
      let edges = m.edges.filter((e) => e.from !== id && e.to !== id);
      for (const c of childIds) {
        if (c === parentId) continue;
        const dup = edges.some(
          (e) => e.kind !== "side" && e.from === parentId && e.to === c
        );
        if (!dup) {
          edges = [...edges, { id: newId("e"), from: parentId, to: c, kind: "down" }];
        }
      }
      return {
        ...m,
        nodes: m.nodes.filter((n) => n.id !== id),
        edges,
        activeView: m.activeView === id ? ROOT_VIEW : m.activeView,
      };
    });
    setTarget(null);
    setTitleEditId((cur) => (cur === id ? null : cur));
  }

  function togglePin(id: string) {
    if (id === ROOT_ID) return;
    setMap((m) => {
      const node = m.nodes.find((n) => n.id === id);
      const nowPinned = !node?.pinned;
      return {
        ...m,
        nodes: m.nodes.map((n) => (n.id === id ? { ...n, pinned: nowPinned } : n)),
        activeView:
          !nowPinned && m.activeView === id ? ROOT_VIEW : m.activeView,
      };
    });
  }

  function toggleHabit(id: string) {
    if (id === ROOT_ID) return;
    setMap((m) => ({
      ...m,
      nodes: m.nodes.map((n) => (n.id === id ? { ...n, habit: !n.habit } : n)),
    }));
  }

  function organize() {
    setMap((m) => organizeMap(m));
    setViewEpoch((n) => n + 1);
  }

  function selectView(id: string) {
    setMap((m) => ({ ...m, activeView: id }));
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
      const dup = m.edges.some(
        (e) => e.kind !== "side" && e.from === from && e.to === to
      );
      if (dup) return m;
      return {
        ...m,
        edges: [...m.edges, { id: newId("e"), from, to, kind: "down" }],
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
    const role: NodeRole = kind === "side" && from ? roleOf(from) : "item";
    const titles: Record<NodeRole, string> = {
      item: "New Box",
      group: "New Group",
      subgroup: "New Subgroup",
      set: "New Set",
    };
    const node: MapNode = {
      id: newId("n"),
      title: titles[role],
      status: "neutral",
      role,
      icon: role === "item" ? pickUnusedIcon(map.nodes.map((n) => n.icon)) : undefined,
      x: Math.round(x - w / 2),
      y: Math.round(kind === "side" && from ? from.y : y),
    };
    setMap((m) => {
      const edges = [
        ...m.edges,
        { id: newId("e"), from: fromId, to: node.id, kind },
      ];
      if (kind === "side") {
        const parent = m.edges.find(
          (e) => e.kind !== "side" && e.to === fromId
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
      return { ...m, nodes: [...m.nodes, node], edges };
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
        setViewEpoch((n) => n + 1);
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

  const hint =
    "Hover a box — bottom dot connects a child, side dots connect a peer. Click the title to rename, click the icon to edit, right-click to pin, mark as a habit, or delete.";

  const rootTitle = map.title || "Talent goals";

  return (
    <main className="relative z-10 h-screen flex flex-col overflow-hidden">
      <header
        ref={headerRef}
        className={`steel-panel app-header${controlsStacked ? " header-stacked" : ""}`}
        title={hint}
      >
        <nav className="app-icons" aria-label="Board tools">
          <IconBtn title="Organize the whole tree" onClick={organize}>
            <OrganizeIcon />
          </IconBtn>
          <div className="settings-wrap" ref={settingsRef}>
            <IconBtn
              title="Settings — import / export"
              on={settingsOpen}
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <GearIcon />
            </IconBtn>
            {settingsOpen && (
              <div className="settings-menu steel-panel gold-trim">
                <button
                  type="button"
                  className="node-menu-item"
                  onClick={() => {
                    setSettingsOpen(false);
                    doExport();
                  }}
                >
                  Export tree…
                </button>
                <button
                  type="button"
                  className="node-menu-item"
                  onClick={() => {
                    setSettingsOpen(false);
                    fileRef.current?.click();
                  }}
                >
                  Import tree…
                </button>
                <button
                  type="button"
                  className="node-menu-item"
                  onClick={() => {
                    setSettingsOpen(false);
                    setAiPrompt(buildAiPrompt(map));
                  }}
                >
                  AI prompting…
                </button>
              </div>
            )}
          </div>
        </nav>

        <div className="app-specs" ref={specsRef}>
          <button
            type="button"
            className={`spec-tab ${map.activeView === ROOT_VIEW ? "active" : ""}`}
            onClick={() => selectView(ROOT_VIEW)}
            title="Show the whole tree"
          >
            <span>{rootTitle}</span>
          </button>
          {pinnedNodes.map((n) => (
            <button
              type="button"
              key={n.id}
              className={`spec-tab${map.activeView === n.id ? " active" : ""}`}
              onClick={() => selectView(n.id)}
              onDoubleClick={(e) => {
                e.preventDefault();
                openEditNode(n.id);
              }}
              title={`${n.title} — focus this branch (double-click to edit)`}
            >
              {n.icon ? (
                <span className="tab-icon">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resolveIcon(n.icon)} alt="" draggable={false} />
                </span>
              ) : null}
              <span>{n.title}</span>
            </button>
          ))}
        </div>
      </header>

      <section className="steel-panel gold-trim rivets app-board">
        <span className="rivet-b" />
        <span className="rivet-c" />
        <MindMapCanvas
          nodes={visibleNodes}
          edges={visibleEdges}
          editMode
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
          onTogglePin={togglePin}
          onToggleHabit={toggleHabit}
          viewEpoch={viewEpoch}
          frameMode={map.activeView === ROOT_VIEW ? "fit" : "initial"}
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
          onSave={saveNode}
          onDelete={deleteNode}
          onClose={() => setTarget(null)}
        />
      )}

      {aiPrompt !== null && (
        <AiPromptModal prompt={aiPrompt} onClose={() => setAiPrompt(null)} />
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

function GearIcon() {
  return (
    <Ico>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.7v2M8 12.3v2M1.7 8h2M12.3 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4" />
    </Ico>
  );
}
