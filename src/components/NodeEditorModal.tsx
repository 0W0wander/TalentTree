"use client";

import { useEffect, useState } from "react";
import type { MapNode, NodeRole, NodeStatus, Spec } from "@/lib/types";
import { roleOf } from "@/lib/types";
import { ICON_PRESETS, resolveIcon, STATUS_CYCLE, STATUS_META } from "@/lib/presets";

type Props = {
  draft: MapNode;
  isNew: boolean;
  specs?: Spec[];
  onSave: (node: MapNode) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

const ROLES: { id: NodeRole; label: string }[] = [
  { id: "item", label: "Box" },
  { id: "group", label: "Group (black)" },
  { id: "subgroup", label: "Subgroup (white)" },
  { id: "set", label: "Set (bronze)" },
];

export default function NodeEditorModal({
  draft,
  isNew,
  specs = [],
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [n, setN] = useState<MapNode>({ ...draft, role: roleOf(draft) });
  const [customIcon, setCustomIcon] = useState(
    n.icon && !ICON_PRESETS.some((p) => p.key === n.icon) ? n.icon : ""
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function set<K extends keyof MapNode>(key: K, value: MapNode[K]) {
    setN((prev) => ({ ...prev, [key]: value }));
  }

  const role = roleOf(n);

  function handleSave() {
    onSave({
      ...n,
      title: n.title.trim() || "Untitled",
      note: n.note?.trim() ? n.note.trim() : undefined,
      icon: customIcon.trim() ? customIcon.trim() : n.icon || undefined,
      role,
      header: undefined,
    });
  }

  const activeIcon = customIcon.trim() || n.icon || "";

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="steel-panel gold-trim rivets w-full max-w-[540px] p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="rivet-b" />
        <span className="rivet-c" />

        <h2 className="font-title gold-text text-2xl mb-1">
          {isNew ? "Forge New Box" : "Edit Box"}
        </h2>
        <p className="text-xs text-[#8b909b] mb-5">
          A branching step on your talent tree
        </p>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="field-label">Kind</label>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`btn-steel ${role === r.id ? "is-on" : ""}`}
                  onClick={() => set("role", r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {specs.length > 0 && (
            <div>
              <label className="field-label">Specialization</label>
              <select
                className="select-steel"
                value={n.specId ?? specs[0]?.id ?? ""}
                onChange={(e) => set("specId", e.target.value)}
              >
                {specs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="field-label">Title</label>
            <input
              className="input-steel"
              value={n.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Graduate High School"
              autoFocus
            />
          </div>

          <div>
            <label className="field-label">Note (optional)</label>
            <textarea
              className="textarea-steel"
              value={n.note ?? ""}
              onChange={(e) => set("note", e.target.value)}
              placeholder="Extra detail shown beneath the title"
            />
          </div>

          {role === "item" && (
            <div>
              <label className="field-label">Status</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_CYCLE.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`btn-steel ${n.status === s ? "is-on" : ""}`}
                    onClick={() => set("status", s as NodeStatus)}
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                      style={{ background: STATUS_META[s].color }}
                    />
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#8b909b] mt-2">
                Used to = you had this, then stopped.
              </p>
            </div>
          )}

          <div>
            <label className="field-label">Icon (optional)</label>
            <div className="flex flex-wrap gap-2 mb-2 items-center">
              <div
                className={`icon-pick ${!activeIcon ? "selected" : ""}`}
                title="No icon"
                onClick={() => {
                  set("icon", undefined);
                  setCustomIcon("");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#8b909b",
                  fontSize: 11,
                }}
              >
                None
              </div>
              {ICON_PRESETS.map((p) => (
                <div
                  key={p.key}
                  className={`icon-pick ${
                    !customIcon.trim() && n.icon === p.key ? "selected" : ""
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
            {activeIcon ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-[#8b909b]">
                Preview:
                <span className="mm-icon" style={{ width: 26, height: 26 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resolveIcon(activeIcon)} alt="" />
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between mt-6">
          <div>
            {!isNew && (
              <button
                className="btn-steel btn-danger"
                onClick={() => onDelete(n.id)}
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
              {isNew ? "Forge Box" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
