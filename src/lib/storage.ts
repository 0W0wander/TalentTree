import type { AppState } from "./types";
import { STATE_VERSION } from "./types";
import { createDefaultState } from "./presets";

const KEY = "talent-forge-state-v1";

export function loadState(): AppState {
  if (typeof window === "undefined") return createDefaultState();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || parsed.version !== STATE_VERSION || !Array.isArray(parsed.trees)) {
      return createDefaultState();
    }
    // Basic normalisation so older / hand-edited data doesn't crash the UI.
    parsed.ranks = parsed.ranks ?? {};
    parsed.pointsPerTier = parsed.pointsPerTier || 5;
    if (!parsed.trees.some((t) => t.id === parsed.activeTreeId)) {
      parsed.activeTreeId = parsed.trees[0]?.id ?? "";
    }
    return parsed;
  } catch {
    return createDefaultState();
  }
}

export function saveState(state: AppState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / serialization errors */
  }
}

export function exportState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function importState(json: string): AppState {
  const parsed = JSON.parse(json) as AppState;
  if (!parsed || !Array.isArray(parsed.trees)) {
    throw new Error("Invalid talent build file.");
  }
  parsed.version = STATE_VERSION;
  parsed.ranks = parsed.ranks ?? {};
  parsed.pointsPerTier = parsed.pointsPerTier || 5;
  parsed.pointsBudget = parsed.pointsBudget || 51;
  if (!parsed.trees.some((t) => t.id === parsed.activeTreeId)) {
    parsed.activeTreeId = parsed.trees[0]?.id ?? "";
  }
  return parsed;
}
