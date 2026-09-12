import type { MindMap } from "./types";
import { HABIT_GOALS_VIEW, STATE_VERSION, isHabitSpec, roleOf } from "./types";
import { createDefaultMap, withUniqueIcons } from "./presets";
import { LAYOUT_VERSION, organizeMap } from "./layout";
import { ensureHabitHub, ensureHabitLaneSpecs, ensureSpecs } from "./specs";

const KEY = "talent-forge-map-v5";
const LEGACY_KEYS = ["talent-forge-map-v4", "talent-forge-map-v3"];

function normalize(parsed: MindMap): MindMap {
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = (Array.isArray(parsed.edges) ? parsed.edges : []).filter(
    (e) => nodeIds.has(e.from) && nodeIds.has(e.to)
  );
  let next: MindMap = {
    version: STATE_VERSION,
    title: parsed.title || "Life Talent Tree",
    layoutVersion: parsed.layoutVersion,
    specs: parsed.specs ?? [],
    activeSpecId: parsed.activeSpecId,
    boardMode:
      parsed.boardMode === "habits" || parsed.boardMode === "goals"
        ? parsed.boardMode
        : undefined,
    nodes: nodes.map((n) => {
      const role = roleOf(n);
      return {
        ...n,
        status: n.status ?? "neutral",
        role,
        header: undefined,
        specId: n.specId,
        x: Number.isFinite(n.x) ? n.x : 0,
        y: Number.isFinite(n.y) ? n.y : 0,
      };
    }),
    edges: edges.map((e) => ({
      ...e,
      kind: e.kind === "side" ? "side" : "down",
    })),
  };
  next = ensureSpecs(next);
  next = ensureHabitLaneSpecs(next);
  next = ensureHabitHub(next);
  if (next.boardMode !== "habits" && next.boardMode !== "goals") {
    const spec = next.specs.find((s) => s.id === next.activeSpecId);
    next = {
      ...next,
      boardMode:
        isHabitSpec(spec) || next.activeSpecId === HABIT_GOALS_VIEW
          ? "habits"
          : "goals",
    };
  }
  next = { ...next, nodes: withUniqueIcons(next.nodes) };
  if ((next.layoutVersion ?? 0) < LAYOUT_VERSION) {
    return organizeMap(next);
  }
  return next;
}

export function loadState(): MindMap {
  if (typeof window === "undefined") return createDefaultMap();
  try {
    const raw =
      window.localStorage.getItem(KEY) ??
      LEGACY_KEYS.map((k) => window.localStorage.getItem(k)).find(
        (v) => v != null
      ) ??
      null;
    if (!raw) return createDefaultMap();
    const parsed = JSON.parse(raw) as MindMap;
    if (!parsed || !Array.isArray(parsed.nodes)) return createDefaultMap();
    return normalize(parsed);
  } catch {
    return createDefaultMap();
  }
}

export function saveState(state: MindMap): void {
  if (typeof window === "undefined") return;
  const write = (s: MindMap) =>
    window.localStorage.setItem(KEY, JSON.stringify(s));
  try {
    write(state);
  } catch {
    // Custom uploaded backdrops can blow the quota; keep the tree itself.
    try {
      write({
        ...state,
        specs: state.specs.map((sp) =>
          sp.background && sp.background.startsWith("data:")
            ? { ...sp, background: "steel" }
            : sp
        ),
      });
    } catch {
      /* ignore remaining quota / serialization errors */
    }
  }
}

export function exportState(state: MindMap): string {
  return JSON.stringify(state, null, 2);
}

export function importState(json: string): MindMap {
  const parsed = JSON.parse(json) as MindMap;
  if (!parsed || !Array.isArray(parsed.nodes)) {
    throw new Error("Invalid talent tree file.");
  }
  return normalize(parsed);
}
