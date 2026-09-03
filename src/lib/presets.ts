import type { AppState, TalentTree } from "./types";
import { STATE_VERSION } from "./types";

export type IconPreset = { key: string; label: string; src: string };

/** Built-in WoW-style ability icons that ship with the app. */
export const ICON_PRESETS: IconPreset[] = [
  { key: "sword", label: "Flameblade", src: "/assets/icon-sword.png" },
  { key: "shield", label: "Guardian", src: "/assets/icon-shield.png" },
  { key: "fire", label: "Immolation", src: "/assets/icon-fire.png" },
  { key: "holy", label: "Holy Light", src: "/assets/icon-holy.png" },
  { key: "lightning", label: "Storm", src: "/assets/icon-lightning.png" },
  { key: "shadow", label: "Shadow", src: "/assets/icon-shadow.png" },
  { key: "frost", label: "Frost", src: "/assets/icon-frost.png" },
  { key: "bow", label: "Hunter's Mark", src: "/assets/icon-bow.png" },
];

const ICON_MAP: Record<string, string> = Object.fromEntries(
  ICON_PRESETS.map((i) => [i.key, i.src])
);

/** Resolve a talent icon value (preset key OR raw url) into an <img> src. */
export function resolveIcon(icon: string): string {
  if (!icon) return ICON_MAP.sword;
  return ICON_MAP[icon] ?? icon;
}

export const ACCENT_PRESETS = [
  "#c8a24a", // gold
  "#4aa3c8", // arcane blue
  "#c84a4a", // fury red
  "#5fc84a", // nature green
  "#9b4ac8", // shadow purple
  "#c87a4a", // ember orange
];

let uid = 0;
export function newId(prefix = "t"): string {
  uid += 1;
  return `${prefix}_${Date.now().toString(36)}_${uid.toString(36)}`;
}

function tree(
  id: string,
  name: string,
  icon: string,
  accent: string,
  talents: TalentTree["talents"]
): TalentTree {
  return { id, name, icon, accent, rows: 7, cols: 4, talents };
}

/** A demonstration build so the app looks alive on first load. */
export function createDefaultState(): AppState {
  const guardian = tree("tree_guardian", "Guardian", "shield", "#c8a24a", [
    { id: "g_1", name: "Iron Will", description: "Increases your Stamina by 2 / 4 / 6%.", icon: "shield", row: 0, col: 1, maxRank: 3 },
    { id: "g_2", name: "Toughness", description: "Reduces the duration of movement-slowing effects by 15 / 30%.", icon: "frost", row: 0, col: 2, maxRank: 2 },
    { id: "g_3", name: "Shield Mastery", description: "Increases block value by 10 / 20 / 30%.", icon: "shield", row: 1, col: 1, maxRank: 3, requires: "g_1" },
    { id: "g_4", name: "Retaliation", description: "Reflects 5 / 10% of blocked damage back at the attacker.", icon: "sword", row: 1, col: 2, maxRank: 2 },
    { id: "g_5", name: "Last Stand", description: "Instantly increases maximum health by 30% for 20 sec.", icon: "holy", row: 2, col: 2, maxRank: 1 },
    { id: "g_6", name: "Bulwark", description: "Your blocks have a 50 / 100% chance to grant a damage absorb shield.", icon: "shield", row: 3, col: 1, maxRank: 2, requires: "g_3" },
    { id: "g_7", name: "Unbreakable", description: "The ultimate wall. Become immune to critical strikes for 12 sec.", icon: "lightning", row: 6, col: 1, maxRank: 1 },
  ]);

  const flame = tree("tree_flame", "Flame", "fire", "#c84a4a", [
    { id: "f_1", name: "Kindling", description: "Increases fire damage by 3 / 6 / 9%.", icon: "fire", row: 0, col: 1, maxRank: 3 },
    { id: "f_2", name: "Searing Blades", description: "Your weapon strikes burn the target for extra fire damage.", icon: "sword", row: 0, col: 2, maxRank: 2 },
    { id: "f_3", name: "Immolate", description: "Engulf yourself in flame, damaging nearby enemies.", icon: "fire", row: 1, col: 2, maxRank: 1, requires: "f_1" },
    { id: "f_4", name: "Pyroblast", description: "A massive delayed fireball. Increases crit by 5 / 10%.", icon: "fire", row: 2, col: 1, maxRank: 2 },
    { id: "f_5", name: "Combustion", description: "Ignite all your damage-over-time effects at once.", icon: "lightning", row: 6, col: 2, maxRank: 1 },
  ]);

  const shadow = tree("tree_shadow", "Shadow", "shadow", "#9b4ac8", [
    { id: "s_1", name: "Malice", description: "Increases spell critical strike chance by 1 / 2 / 3 / 4 / 5%.", icon: "shadow", row: 0, col: 1, maxRank: 5 },
    { id: "s_2", name: "Improved Curse", description: "Reduces the cost of your curses by 50 / 100%.", icon: "shadow", row: 0, col: 2, maxRank: 2 },
    { id: "s_3", name: "Siphon Life", description: "Drains health from the target over time.", icon: "shadow", row: 1, col: 1, maxRank: 1, requires: "s_1" },
    { id: "s_4", name: "Death's Embrace", description: "Deal 5 / 10% more damage to enemies below 35% health.", icon: "shadow", row: 2, col: 2, maxRank: 2 },
    { id: "s_5", name: "Soul Reaper", description: "Unleash the void. A devastating finisher on low-health foes.", icon: "shadow", row: 6, col: 1, maxRank: 1 },
  ]);

  return {
    version: STATE_VERSION,
    title: "Talent Forge",
    pointsBudget: 51,
    pointsPerTier: 5,
    activeTreeId: guardian.id,
    trees: [guardian, flame, shadow],
    ranks: {},
  };
}
