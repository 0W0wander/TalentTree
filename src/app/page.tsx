"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AppState, Talent, TalentTree } from "@/lib/types";
import { STATE_VERSION } from "@/lib/types";
import { createDefaultState, newId, ACCENT_PRESETS } from "@/lib/presets";
import {
  loadState,
  saveState,
  exportState,
  importState,
} from "@/lib/storage";
import {
  pointsInTree,
  totalPointsSpent,
  canRemovePoint,
} from "@/lib/talentLogic";
import TalentTreeView from "@/components/TalentTreeView";
import TalentEditorModal from "@/components/TalentEditorModal";
import TreeSettingsModal from "@/components/TreeSettingsModal";
import { resolveIcon } from "@/lib/presets";

type EditTarget =
  | { kind: "talent"; talent: Talent; isNew: boolean }
  | { kind: "tree" }
  | null;

export default function Page() {
  const [state, setState] = useState<AppState>(() => createDefaultState());
  const [loaded, setLoaded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [target, setTarget] = useState<EditTarget>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load persisted build only on the client. Gating the interactive UI behind
  // `loaded` keeps the server-rendered HTML and the first client render
  // identical, avoiding any localStorage-driven hydration mismatch.
  useEffect(() => {
    setState(loadState());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveState(state);
  }, [state, loaded]);

  const activeTree = useMemo(
    () =>
      state.trees.find((t) => t.id === state.activeTreeId) ?? state.trees[0],
    [state]
  );

  const spent = totalPointsSpent(state);
  const remaining = state.pointsBudget - spent;

  /* ---------------- point spending ---------------- */
  function addPoint(talentId: string) {
    setState((s) => ({
      ...s,
      ranks: { ...s.ranks, [talentId]: (s.ranks[talentId] ?? 0) + 1 },
    }));
  }

  function removePoint(talentId: string) {
    setState((s) => {
      const tree = s.trees.find((t) =>
        t.talents.some((x) => x.id === talentId)
      );
      const talent = tree?.talents.find((x) => x.id === talentId);
      if (!tree || !talent) return s;
      if (!canRemovePoint(s, tree, talent)) return s;
      return {
        ...s,
        ranks: {
          ...s.ranks,
          [talentId]: Math.max(0, (s.ranks[talentId] ?? 0) - 1),
        },
      };
    });
  }

  function resetTree(treeId: string) {
    setState((s) => {
      const tree = s.trees.find((t) => t.id === treeId);
      if (!tree) return s;
      const ranks = { ...s.ranks };
      for (const t of tree.talents) delete ranks[t.id];
      return { ...s, ranks };
    });
  }

  function resetAll() {
    setState((s) => ({ ...s, ranks: {} }));
  }

  /* ---------------- talent editing ---------------- */
  function openNewTalent(row: number, col: number) {
    setTarget({
      kind: "talent",
      isNew: true,
      talent: {
        id: newId("tal"),
        name: "",
        description: "",
        icon: "sword",
        row,
        col,
        maxRank: 1,
      },
    });
  }

  function saveTalent(talent: Talent) {
    setState((s) => {
      const trees = s.trees.map((tree) => {
        if (tree.id !== activeTree.id) return tree;
        const exists = tree.talents.some((t) => t.id === talent.id);
        const talents = exists
          ? tree.talents.map((t) => (t.id === talent.id ? talent : t))
          : [...tree.talents, talent];
        return { ...tree, talents };
      });
      return { ...s, trees };
    });
    setTarget(null);
  }

  function deleteTalent(id: string) {
    setState((s) => {
      const ranks = { ...s.ranks };
      delete ranks[id];
      const trees = s.trees.map((tree) => ({
        ...tree,
        talents: tree.talents
          .filter((t) => t.id !== id)
          .map((t) => (t.requires === id ? { ...t, requires: undefined } : t)),
      }));
      return { ...s, trees, ranks };
    });
    setTarget(null);
  }

  /* ---------------- tree editing ---------------- */
  function saveTree(tree: TalentTree) {
    setState((s) => ({
      ...s,
      trees: s.trees.map((t) => (t.id === tree.id ? tree : t)),
    }));
    setTarget(null);
  }

  function addTree() {
    const id = newId("tree");
    const accent =
      ACCENT_PRESETS[state.trees.length % ACCENT_PRESETS.length];
    const tree: TalentTree = {
      id,
      name: "New Tree",
      icon: "lightning",
      accent,
      rows: 7,
      cols: 4,
      talents: [],
    };
    setState((s) => ({
      ...s,
      trees: [...s.trees, tree],
      activeTreeId: id,
    }));
    setEditMode(true);
    setTarget({ kind: "tree" });
  }

  function deleteTree(id: string) {
    setState((s) => {
      if (s.trees.length <= 1) return s;
      const trees = s.trees.filter((t) => t.id !== id);
      const ranks = { ...s.ranks };
      const removed = s.trees.find((t) => t.id === id);
      removed?.talents.forEach((t) => delete ranks[t.id]);
      return {
        ...s,
        trees,
        ranks,
        activeTreeId:
          s.activeTreeId === id ? trees[0].id : s.activeTreeId,
      };
    });
    setTarget(null);
  }

  /* ---------------- import / export ---------------- */
  function doExport() {
    const blob = new Blob([exportState(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.title.replace(/\s+/g, "-").toLowerCase() || "talent"}-build.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setState(importState(String(reader.result)));
      } catch {
        alert("That file is not a valid Talent Forge build.");
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

  return (
    <main className="relative z-10 min-h-screen flex flex-col items-center px-4 pb-40 pt-6">
      {/* ---------------- HEADER ---------------- */}
      <header className="relative w-full max-w-[1120px] flex flex-col items-center">
        {/* dragon crest */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/dragon-crest.png"
          alt=""
          className="ornament w-[420px] max-w-[80vw] -mb-8 select-none"
        />
        <h1 className="font-title gold-text text-4xl sm:text-5xl tracking-widest text-center">
          {state.title}
        </h1>
        <div className="mt-1 h-px w-64 bg-gradient-to-r from-transparent via-[rgba(215,180,90,0.6)] to-transparent" />

        {/* points panel */}
        <div className="steel-panel gold-trim rivets relative mt-5 px-8 py-3 flex items-center gap-6">
          <span className="rivet-b" />
          <span className="rivet-c" />
          <div className="text-center">
            <div className="font-title text-[10px] tracking-widest text-[var(--gold)] uppercase">
              Points Remaining
            </div>
            <div
              className={`font-title text-3xl leading-none ${
                remaining < 0 ? "text-[var(--rune-red)]" : "gold-text"
              }`}
            >
              {remaining}
              <span className="text-base text-[#8b909b]"> / {state.pointsBudget}</span>
            </div>
          </div>
          <div className="w-px h-10 bg-[rgba(215,180,90,0.25)]" />
          <label className="text-center cursor-pointer">
            <div className="font-title text-[10px] tracking-widest text-[var(--gold)] uppercase">
              Budget
            </div>
            <input
              type="number"
              min={1}
              max={200}
              value={state.pointsBudget}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  pointsBudget: Math.max(1, Number(e.target.value) || 1),
                }))
              }
              className="w-16 bg-transparent text-center font-title text-2xl gold-text outline-none"
            />
          </label>
        </div>
      </header>

      {/* ---------------- SPEC TABS ---------------- */}
      <nav className="w-full max-w-[1120px] mt-8 flex items-end gap-1 px-2 flex-wrap">
        {state.trees.map((tree) => {
          const p = pointsInTree(state, tree);
          return (
            <div
              key={tree.id}
              className={`spec-tab ${tree.id === activeTree.id ? "active" : ""}`}
              onClick={() =>
                setState((s) => ({ ...s, activeTreeId: tree.id }))
              }
              onDoubleClick={() => {
                setEditMode(true);
                setTarget({ kind: "tree" });
              }}
            >
              <div className="tab-icon">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolveIcon(tree.icon)} alt="" />
              </div>
              <span>{tree.name}</span>
              <span className="tab-points">{p}</span>
            </div>
          );
        })}
        {editMode && (
          <button
            className="spec-tab"
            onClick={addTree}
            title="Add a new tree"
            style={{ color: "var(--gold)" }}
          >
            <span className="text-xl leading-none">+</span> Tree
          </button>
        )}
      </nav>

      {/* ---------------- BOARD ---------------- */}
      <section className="steel-panel gold-trim rivets relative w-full max-w-[1120px] p-6 sm:p-8 overflow-auto">
        <span className="rivet-b" />
        <span className="rivet-c" />

        {/* board title row */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="tab-icon"
              style={{ width: 44, height: 44 }}
              onClick={() => {
                if (editMode) setTarget({ kind: "tree" });
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolveIcon(activeTree.icon)} alt="" />
            </div>
            <div>
              <h2 className="font-title text-2xl gold-text leading-none">
                {activeTree.name}
              </h2>
              <div className="text-xs text-[#8b909b] mt-1">
                {pointsInTree(state, activeTree)} points spent
                {editMode && " · double-click tab or icon for tree settings"}
              </div>
            </div>
          </div>
          <button
            className="btn-steel"
            onClick={() => resetTree(activeTree.id)}
            title="Refund all points in this tree"
          >
            Reset Tree
          </button>
        </div>

        {/* the tree */}
        <div className="flex justify-center min-w-fit">
          <TalentTreeView
            state={state}
            tree={activeTree}
            editMode={editMode}
            onAddPoint={addPoint}
            onRemovePoint={removePoint}
            onEditTalent={(t) =>
              setTarget({ kind: "talent", talent: t, isNew: false })
            }
            onAddTalent={openNewTalent}
          />
        </div>

        {editMode && activeTree.talents.length === 0 && (
          <p className="text-center text-[#8b909b] mt-4 text-sm">
            Click a{" "}
            <span className="text-[var(--gold)]">+</span> cell above to forge your
            first talent.
          </p>
        )}
      </section>

      {/* ---------------- GRYPHON TOOLBAR ---------------- */}
      <div className="fixed bottom-0 left-0 right-0 z-20 flex justify-center items-end pointer-events-none">
        <div className="relative flex items-end max-w-[1120px] w-full justify-center px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/gryphon.png"
            alt=""
            className="ornament hidden sm:block w-[120px] -mr-4 -mb-1 self-end"
          />
          <div className="steel-panel gold-trim rivets pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-b-none flex-wrap justify-center">
            <span className="rivet-b" />
            <span className="rivet-c" />
            <button
              className={`btn-steel ${editMode ? "is-on" : ""}`}
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? "✦ Editing" : "Edit Mode"}
            </button>
            {editMode && (
              <button
                className="btn-steel"
                onClick={() => setTarget({ kind: "tree" })}
              >
                Tree Settings
              </button>
            )}
            <div className="w-px h-7 bg-[rgba(215,180,90,0.25)] mx-1" />
            <button className="btn-steel" onClick={resetAll}>
              Reset All
            </button>
            <button className="btn-steel" onClick={doExport}>
              Export
            </button>
            <button
              className="btn-steel"
              onClick={() => fileRef.current?.click()}
            >
              Import
            </button>
            <button
              className="btn-steel"
              onClick={() => {
                if (
                  confirm(
                    "Start over from the default demo build? Your current build will be lost."
                  )
                ) {
                  const fresh = createDefaultState();
                  fresh.version = STATE_VERSION;
                  setState(fresh);
                }
              }}
            >
              New
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/gryphon.png"
            alt=""
            className="ornament hidden sm:block w-[120px] -ml-4 -mb-1 self-end"
            style={{ transform: "scaleX(-1)" }}
          />
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={onImportFile}
      />

      {/* ---------------- MODALS ---------------- */}
      {target?.kind === "talent" && (
        <TalentEditorModal
          tree={activeTree}
          draft={target.talent}
          isNew={target.isNew}
          onSave={saveTalent}
          onDelete={deleteTalent}
          onClose={() => setTarget(null)}
        />
      )}
      {target?.kind === "tree" && (
        <TreeSettingsModal
          tree={activeTree}
          canDelete={state.trees.length > 1}
          onSave={saveTree}
          onDelete={deleteTree}
          onClose={() => setTarget(null)}
        />
      )}
    </main>
  );
}
