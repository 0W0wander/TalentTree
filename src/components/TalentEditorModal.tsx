"use client";

import { useEffect, useState } from "react";
import type { Talent, TalentTree } from "@/lib/types";
import { ICON_PRESETS, resolveIcon } from "@/lib/presets";

type Props = {
  tree: TalentTree;
  draft: Talent;
  isNew: boolean;
  onSave: (talent: Talent) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

export default function TalentEditorModal({
  tree,
  draft,
  isNew,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [t, setT] = useState<Talent>(draft);
  const [customIcon, setCustomIcon] = useState(
    ICON_PRESETS.some((p) => p.key === draft.icon) ? "" : draft.icon
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function set<K extends keyof Talent>(key: K, value: Talent[K]) {
    setT((prev) => ({ ...prev, [key]: value }));
  }

  const occupied = new Set(
    tree.talents.filter((x) => x.id !== t.id).map((x) => `${x.row}:${x.col}`)
  );

  function handleSave() {
    const clean: Talent = {
      ...t,
      name: t.name.trim() || "Unnamed Talent",
      maxRank: Math.max(1, Math.min(20, Math.floor(t.maxRank) || 1)),
      row: Math.max(0, Math.min(tree.rows - 1, Math.floor(t.row))),
      col: Math.max(0, Math.min(tree.cols - 1, Math.floor(t.col))),
      icon: customIcon.trim() ? customIcon.trim() : t.icon,
      requires: t.requires || undefined,
      requiredPoints:
        typeof t.requiredPoints === "number" && !Number.isNaN(t.requiredPoints)
          ? t.requiredPoints
          : undefined,
    };
    onSave(clean);
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="steel-panel gold-trim rivets w-full max-w-[560px] p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="rivet-b" />
        <span className="rivet-c" />

        <h2 className="font-title gold-text text-2xl mb-1">
          {isNew ? "Forge New Talent" : "Edit Talent"}
        </h2>
        <p className="text-xs text-[#8b909b] mb-5">
          Shaping the <span className="text-[var(--gold)]">{tree.name}</span> tree
        </p>

        <div className="grid grid-cols-1 gap-4">
          {/* Icon + preview */}
          <div className="flex gap-4">
            <div className="talent-slot" style={{ cursor: "default" }}>
              <div className="slot-inner">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolveIcon(customIcon.trim() || t.icon)} alt="" />
              </div>
            </div>
            <div className="flex-1">
              <label className="field-label">Name</label>
              <input
                className="input-steel"
                value={t.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Shield Mastery"
                autoFocus
              />
            </div>
          </div>

          {/* Icon picker */}
          <div>
            <label className="field-label">Icon</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {ICON_PRESETS.map((p) => (
                <div
                  key={p.key}
                  className={`icon-pick ${
                    !customIcon.trim() && t.icon === p.key ? "selected" : ""
                  }`}
                  title={p.label}
                  onClick={() => {
                    set("icon", p.key);
                    setCustomIcon("");
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt={p.label} />
                </div>
              ))}
            </div>
            <input
              className="input-steel"
              value={customIcon}
              onChange={(e) => setCustomIcon(e.target.value)}
              placeholder="…or paste a custom image URL"
            />
          </div>

          {/* Description */}
          <div>
            <label className="field-label">Description</label>
            <textarea
              className="textarea-steel"
              value={t.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What does this talent do?"
            />
          </div>

          {/* numbers row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="field-label">Max Rank</label>
              <input
                type="number"
                min={1}
                max={20}
                className="input-steel"
                value={t.maxRank}
                onChange={(e) => set("maxRank", Number(e.target.value))}
              />
            </div>
            <div>
              <label className="field-label">Row</label>
              <select
                className="select-steel"
                value={t.row}
                onChange={(e) => set("row", Number(e.target.value))}
              >
                {Array.from({ length: tree.rows }).map((_, r) => (
                  <option key={r} value={r}>
                    Tier {r + 1}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Column</label>
              <select
                className="select-steel"
                value={t.col}
                onChange={(e) => set("col", Number(e.target.value))}
              >
                {Array.from({ length: tree.cols }).map((_, c) => (
                  <option key={c} value={c} disabled={occupied.has(`${t.row}:${c}`)}>
                    Col {c + 1}
                    {occupied.has(`${t.row}:${c}`) ? " (taken)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* gating row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Requires Talent</label>
              <select
                className="select-steel"
                value={t.requires ?? ""}
                onChange={(e) => set("requires", e.target.value || undefined)}
              >
                <option value="">— None —</option>
                {tree.talents
                  .filter((x) => x.id !== t.id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="field-label">Req. Points (optional)</label>
              <input
                type="number"
                min={0}
                className="input-steel"
                value={t.requiredPoints ?? ""}
                placeholder="auto by tier"
                onChange={(e) =>
                  set(
                    "requiredPoints",
                    e.target.value === "" ? undefined : Number(e.target.value)
                  )
                }
              />
            </div>
          </div>
        </div>

        {/* actions */}
        <div className="flex items-center justify-between mt-6">
          <div>
            {!isNew && (
              <button
                className="btn-steel btn-danger"
                onClick={() => onDelete(t.id)}
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-steel" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-steel is-on" onClick={handleSave}>
              {isNew ? "Forge Talent" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
