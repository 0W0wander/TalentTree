"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Two rows of 52px icons with an 8px gap between them. */
const TWO_ROWS = 112;

/**
 * The icon grid. Stays at two lines until there are more choices than fit,
 * then a … button opens the rest.
 */
export default function IconChoices({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > TWO_ROWS + 2);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [count, open]);

  return (
    <div className="mb-2">
      <div ref={ref} className={`icon-choices ${open ? "is-open" : ""}`}>
        {children}
      </div>
      {overflows ? (
        <button
          type="button"
          className="icon-pick icon-more"
          title={open ? "Show fewer icons" : "Show more icons"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "–" : "…"}
        </button>
      ) : null}
    </div>
  );
}
