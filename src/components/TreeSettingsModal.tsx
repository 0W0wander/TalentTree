"use client";

import { useEffect, useState } from "react";
import type { TalentTree } from "@/lib/types";
import { ICON_PRESETS, ACCENT_PRESETS, resolveIcon } from "@/lib/presets";

type Props = {
  tree: TalentTree;
  canDelete: boolean;
  onSave: (tree: TalentTree) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

export default function TreeSettingsModal({
  tree,
  canDelete,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [t, setT] = useState<TalentTree>(tree);
  const [customIcon, setCustomIcon] = useState(
    ICON_PRESETS.some((p) => p.key === tree.icon) ? "" : tree.icon
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSave() {
    onSave({
      ...t,
      name: t.name.trim() || "New Tree",
      icon: customIcon.trim() ? customIcon.trim() : t.icon,
      rows: Math.max(1, Math.min(12, Math.floor(t.rows) || 7)),
      cols: Math.max(1, Math.min(8, Math.floor(t.cols) || 4)),
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="steel-panel gold-trim rivets w-full max-w-[520px] p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="rivet-b" />
        <span className="rivet-c" />

        <h2 className="font-title gold-text text-2xl mb-5">Tree Settings</h2>

        <div className="flex gap-4 mb-4">
          <div className="spec-tab active" style={{ cursor: "default" }}>
            <div className="tab-icon">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolveIcon(customIcon.trim() || t.icon)} alt="" />
            </div>
          </div>
          <div className="flex-1">
            <label className="field-label">Tree Name</label>
            <input
              className="input-steel"
              value={t.name}
              onChange={(e) => setT({ ...t, name: e.target.value })}
              autoFocus
            />
          </div>
        </div>

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
                setT({ ...t, icon: p.key });
                setCustomIcon("");
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt={p.label} />
            </div>
          ))}
        </div>
        <input
          className="input-steel mb-4"
          value={customIcon}
          onChange={(e) => setCustomIcon(e.target.value)}
          placeholder="…or paste a custom image URL"
        />

        <label className="field-label">Accent Color</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {ACCENT_PRESETS.map((c) => (
            <button
              key={c}
              onClick={() => setT({ ...t, accent: c })}
              className="w-8 h-8 rounded-full"
              style={{
                background: c,
                boxShadow:
                  t.accent === c
                    ? `0 0 0 2px #000, 0 0 0 4px ${c}, 0 0 12px ${c}`
                    : "inset 0 1px 2px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.7)",
              }}
            />
          ))}
          <input
            type="color"
            value={t.accent}
            onChange={(e) => setT({ ...t, accent: e.target.value })}
            className="w-8 h-8 rounded-full bg-transparent border-0 cursor-pointer p-0"
            title="Custom color"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <label className="field-label">Rows (Tiers)</label>
            <input
              type="number"
              min={1}
              max={12}
              className="input-steel"
              value={t.rows}
              onChange={(e) => setT({ ...t, rows: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="field-label">Columns</label>
            <input
              type="number"
              min={1}
              max={8}
              className="input-steel"
              value={t.cols}
              onChange={(e) => setT({ ...t, cols: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-6">
          <div>
            {canDelete && (
              <button
                className="btn-steel btn-danger"
                onClick={() => onDelete(t.id)}
              >
                Delete Tree
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-steel" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-steel is-on" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
