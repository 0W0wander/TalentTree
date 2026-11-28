"use client";

import { useEffect, useRef, useState } from "react";
import type { Spec } from "@/lib/types";
import {
  ACCENT_PRESETS,
  BG_PRESETS,
  ICON_PRESETS,
  isBgPreset,
  resolveIcon,
} from "@/lib/presets";
import { fileToIcon, ICON_PX } from "@/lib/iconFile";

type Props = {
  spec: Spec;
  canDelete: boolean;
  onSave: (spec: Spec) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

export default function SpecEditorModal({
  spec,
  canDelete,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [s, setS] = useState<Spec>(spec);
  const fileRef = useRef<HTMLInputElement>(null);
  const iconRef = useRef<HTMLInputElement>(null);
  const [iconError, setIconError] = useState("");
  const customBg =
    s.background && !isBgPreset(s.background) ? s.background : "";
  const customIcon = !ICON_PRESETS.some((p) => p.key === s.icon);

  async function onPickIcon(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const url = await fileToIcon(file);
      setS((prev) => ({ ...prev, icon: url }));
      setIconError("");
    } catch (err) {
      setIconError(err instanceof Error ? err.message : "Could not read that image.");
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      if (url) setS((prev) => ({ ...prev, background: url }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="steel-panel gold-trim rivets w-full max-w-[500px] p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="rivet-b" />
        <span className="rivet-c" />
        <h2 className="font-title gold-text text-2xl mb-1">Specialization</h2>
        <p className="text-xs text-[#8b909b] mb-5">
          A talent tree column, like a class spec
        </p>

        <label className="field-label">Name</label>
        <input
          className="input-steel mb-4"
          value={s.name}
          onChange={(e) => setS({ ...s, name: e.target.value })}
          autoFocus
        />

        <label className="field-label">Section</label>
        <div className="flex flex-wrap gap-2 mb-1">
          <button
            type="button"
            className={`btn-steel ${s.kind !== "habit" ? "is-on" : ""}`}
            onClick={() => setS({ ...s, kind: "achievement" })}
          >
            Achievements
          </button>
          <button
            type="button"
            className={`btn-steel ${s.kind === "habit" ? "is-on" : ""}`}
            onClick={() => setS({ ...s, kind: "habit" })}
          >
            Habits
          </button>
        </div>
        <p className="text-xs text-[#8b909b] mb-4">
          Habits live behind the H/G switch. Each habit subgroup is its own
          specialization so you can focus on one lane at a time.
        </p>

        <label className="field-label">Icon</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {customIcon ? (
            <div className="icon-pick selected" title="Uploaded icon">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolveIcon(s.icon)} alt="" />
            </div>
          ) : null}
          {ICON_PRESETS.map((p) => (
            <div
              key={p.key}
              className={`icon-pick ${s.icon === p.key ? "selected" : ""}`}
              title={p.label}
              onClick={() => setS({ ...s, icon: p.key })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt={p.label} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            className="btn-steel compact"
            onClick={() => iconRef.current?.click()}
          >
            Open folder
          </button>
          <span className="text-xs text-[#8b909b]">
            Pick an image from your computer. It is saved at {ICON_PX}×{ICON_PX}.
          </span>
        </div>
        {iconError ? (
          <p className="text-xs text-[#ff8a82] -mt-3 mb-4">{iconError}</p>
        ) : null}
        <input
          ref={iconRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickIcon}
        />

        <label className="field-label">Accent</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {ACCENT_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              className="w-8 h-8 rounded-full border border-black"
              style={{
                background: c,
                boxShadow:
                  s.accent === c
                    ? `0 0 0 2px #000, 0 0 0 4px ${c}`
                    : "inset 0 1px 2px rgba(255,255,255,0.35)",
              }}
              onClick={() => setS({ ...s, accent: c })}
            />
          ))}
        </div>

        <label className="field-label">Panel Backdrop</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {BG_PRESETS.map((b) => (
            <button
              key={b.key}
              type="button"
              className={`bg-pick ${
                s.background === b.key || (!s.background && b.key === "steel")
                  ? "selected"
                  : ""
              }`}
              onClick={() => setS({ ...s, background: b.key })}
              title={b.label}
            >
              <div className={`spec-frame-bg is-preset ${b.key}`} />
              <span>{b.label}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 mb-6">
          <input
            className="input-steel"
            value={customBg}
            onChange={(e) =>
              setS({ ...s, background: e.target.value.trim() || "steel" })
            }
            placeholder="…or paste an image URL"
          />
          <button
            type="button"
            className="btn-steel compact"
            onClick={() => fileRef.current?.click()}
          >
            Upload
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickFile}
        />

        <div className="flex items-center justify-between">
          <div>
            {canDelete && (
              <button
                className="btn-steel btn-danger"
                onClick={() => onDelete(s.id)}
              >
                Delete Spec
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-steel" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-steel is-on"
              onClick={() =>
                onSave({ ...s, name: s.name.trim() || "Specialization" })
              }
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
