"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  prompt: string;
  onClose: () => void;
};

export default function AiPromptModal({ prompt, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(prompt);
      ok = true;
    } catch {
      const el = textRef.current;
      if (el) {
        el.focus();
        el.select();
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
      }
    }
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
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
          and paste it into your AI. Paste the AI&apos;s reply straight into
          Import to apply the new layout.
        </p>

        <textarea
          ref={textRef}
          className="textarea-steel"
          style={{ minHeight: 320, fontFamily: "ui-monospace, monospace", fontSize: 12 }}
          value={prompt}
          readOnly
          spellCheck={false}
          onFocus={(e) => e.currentTarget.select()}
        />

        <div className="flex items-center justify-between mt-5">
          <span className="text-xs text-[#8b909b]">
            {copied ? "Copied to clipboard." : `${prompt.length.toLocaleString()} characters`}
          </span>
          <div className="flex gap-2">
            <button className="btn-steel" onClick={onClose}>
              Close
            </button>
            <button className="btn-steel is-on" onClick={copy}>
              {copied ? "Copied ✓" : "Copy to clipboard"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
