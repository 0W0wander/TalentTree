import type { MindMap, MapNode, MapEdge } from "./types";
import { ROOT_ID, ROOT_VIEW, STATE_VERSION, roleOf } from "./types";
import { createDefaultMap, withUniqueIcons } from "./presets";
import { LAYOUT_VERSION, organizeMap } from "./layout";
import { migrateToTree } from "./specs";
import { parseOutline } from "./outline";

const KEY = "talent-forge-map-v5";
const LEGACY_KEYS = ["talent-forge-map-v4", "talent-forge-map-v3"];

/** Old saves carried a `specs` array and per-node `specId` / `boardMode`. */
type LegacyMindMap = MindMap & {
  specs?: { id: string; kind?: string }[];
  activeSpecId?: string;
};

function normalize(parsed: LegacyMindMap): MindMap {
  const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const nodeIds = new Set(rawNodes.map((n) => n.id));
  const edges: MapEdge[] = (Array.isArray(parsed.edges) ? parsed.edges : [])
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e) => ({ ...e, kind: e.kind === "side" ? "side" : "down" }));

  const nodes: MapNode[] = rawNodes.map((n) => ({
    ...n,
    status: n.status ?? "neutral",
    role: roleOf(n),
    header: undefined,
    x: Number.isFinite(n.x) ? n.x : 0,
    y: Number.isFinite(n.y) ? n.y : 0,
  }));

  const legacy = Array.isArray(parsed.specs) && parsed.specs.length > 0;
  const hasRoot = nodes.some((n) => n.id === ROOT_ID);

  let next: LegacyMindMap = {
    version: STATE_VERSION,
    title: parsed.title || "Talent goals",
    layoutVersion: parsed.layoutVersion,
    nodes,
    edges,
    activeView:
      typeof parsed.activeView === "string" ? parsed.activeView : ROOT_VIEW,
  };

  if (legacy || !hasRoot) {
    next.specs = parsed.specs;
    next = migrateToTree(next);
  }

  // A focused view must point at a real, pinned node; otherwise show it all.
  if (next.activeView !== ROOT_VIEW) {
    const target = next.nodes.find((n) => n.id === next.activeView);
    if (!target || !target.pinned) next.activeView = ROOT_VIEW;
  }

  next = { ...next, nodes: withUniqueIcons(next.nodes) };

  const clean: MindMap = {
    version: STATE_VERSION,
    title: next.title,
    nodes: next.nodes,
    edges: next.edges,
    activeView: next.activeView,
    layoutVersion: next.layoutVersion,
  };

  if ((clean.layoutVersion ?? 0) < LAYOUT_VERSION) {
    return organizeMap(clean);
  }
  return clean;
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
    const parsed = JSON.parse(raw) as LegacyMindMap;
    if (!parsed || !Array.isArray(parsed.nodes)) return createDefaultMap();
    return normalize(parsed);
  } catch {
    return createDefaultMap();
  }
}

export function saveState(state: MindMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / serialization errors */
  }
}

export function exportState(state: MindMap): string {
  return JSON.stringify(state, null, 2);
}

export function importState(text: string): MindMap {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Nothing to import.");
  // JSON export (starts with { or [) vs. the plain-text outline format.
  if (trimmed[0] === "{" || trimmed[0] === "[") {
    const parsed = JSON.parse(trimmed) as LegacyMindMap;
    if (!parsed || !Array.isArray(parsed.nodes)) {
      throw new Error("Invalid talent tree file.");
    }
    return normalize(parsed);
  }
  return normalize(parseOutline(trimmed) as LegacyMindMap);
}
