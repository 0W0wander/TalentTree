"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  prompt: string;
  /** Apply a pasted outline/JSON reply. Returns an error message, or null on success. */
  onApply: (text: string) => string | null;
  onClose: () => void;
};

export default function AiPromptModal({ prompt, onApply, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    const el = promptRef.current;
    if (el) {
      el.focus();
      el.select();
    }
    let ok = false;
    try {
      await navigator.clipboard.writeText(prompt);
      ok = true;
    } catch {
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
    }
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2000);
  }

  function apply() {
    const err = onApply(reply);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="steel-panel gold-trim rivets w-full max-w-[720px] p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="rivet-b" />
        <span className="rivet-c" />

        <h2 className="font-title gold-text text-2xl mb-1">AI Prompting</h2>
        <p className="text-xs text-[#8b909b] mb-4">
          Copy this prompt, add your reorganization instructions at the bottom,
          and paste it into your AI. Then paste the AI&apos;s reply below and
          Reorganize to rebuild the tree.
        </p>

        <label className="field-label">1 · Copy this prompt</label>
        <textarea
          ref={promptRef}
          className="textarea-steel"
          style={{ minHeight: 220, fontFamily: "ui-monospace, monospace", fontSize: 12 }}
          value={prompt}
          readOnly
          spellCheck={false}
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className="flex items-center justify-between mt-2 mb-5">
          <span className="text-xs text-[#8b909b]">
            {copied
              ? "Copied to clipboard."
              : `${prompt.length.toLocaleString()} characters`}
          </span>
          <button className="btn-steel" onClick={copy}>
            {copied ? "Copied ✓" : "Copy to clipboard"}
          </button>
        </div>

        <label className="field-label">2 · Paste the AI&apos;s reply</label>
        <textarea
          className="textarea-steel"
          style={{ minHeight: 150, fontFamily: "ui-monospace, monospace", fontSize: 12 }}
          value={reply}
          spellCheck={false}
          placeholder={"- Talent goals\n  - …the AI's reorganized outline goes here"}
          onChange={(e) => {
            setReply(e.target.value);
            if (error) setError(null);
          }}
        />
        {error && (
          <p className="text-xs mt-2" style={{ color: "#ff8a82" }}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 mt-5">
          <button className="btn-steel" onClick={onClose}>
            Close
          </button>
          <button
            className="btn-steel is-on"
            onClick={apply}
            disabled={!reply.trim()}
            style={reply.trim() ? undefined : { opacity: 0.5, cursor: "not-allowed" }}
          >
            Reorganize tree
          </button>
        </div>
      </div>
    </div>
  );
}
