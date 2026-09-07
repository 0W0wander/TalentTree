import type { MindMap, MapNode, MapEdge, NodeRole, NodeStatus, Spec } from "./types";
import { ALL_SPECS, STATE_VERSION, isLabel } from "./types";
import { organizeMap } from "./layout";

export type IconPreset = { key: string; label: string; src: string };

/** Built-in WoW-style icons that ship with the app. */
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

/** Resolve an icon value (preset key OR raw url) into an <img> src. */
export function resolveIcon(icon: string): string {
  return ICON_MAP[icon] ?? icon;
}

const PRESET_KEYS = ICON_PRESETS.map((p) => p.key);

/** Prefer a preset that nothing else is using; once every key is taken, any of them. */
export function pickUnusedIcon(used: Iterable<string | undefined>): string {
  const taken = new Set<string>();
  for (const k of used) {
    if (k && PRESET_KEYS.includes(k)) taken.add(k);
  }
  const unused = PRESET_KEYS.filter((k) => !taken.has(k));
  const pool = unused.length > 0 ? unused : PRESET_KEYS;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/** Fill missing icons on item boxes without reshuffling ones already chosen. */
export function withUniqueIcons(nodes: MapNode[]): MapNode[] {
  const used = nodes
    .filter((n) => !isLabel(n) && n.icon)
    .map((n) => n.icon);
  return nodes.map((n) => {
    if (isLabel(n) || n.icon) return n;
    const icon = pickUnusedIcon(used);
    used.push(icon);
    return { ...n, icon };
  });
}

export const STATUS_META: Record<
  NodeStatus,
  { label: string; color: string }
> = {
  neutral: { label: "Neutral", color: "#9aa0ab" },
  done: { label: "Done", color: "#6fe36a" },
  progress: { label: "In Progress", color: "#4ac8c8" },
  goal: { label: "Goal", color: "#ff5a52" },
  special: { label: "Special", color: "#c874e0" },
};

/** Cycle order used when clicking a node's status pip. */
export const STATUS_CYCLE: NodeStatus[] = [
  "neutral",
  "progress",
  "done",
  "goal",
  "special",
];

export const ACCENT_PRESETS = [
  "#c8a24a",
  "#4aa3c8",
  "#c84a4a",
  "#5fc84a",
  "#9b4ac8",
  "#c87a4a",
];

export type BgPreset = { key: string; label: string };

/** Built-in talent-tree panel atmospheres. */
export const BG_PRESETS: BgPreset[] = [
  { key: "steel", label: "Steel" },
  { key: "ember", label: "Ember" },
  { key: "gold", label: "Gold Hall" },
  { key: "frost", label: "Frost" },
  { key: "forest", label: "Grove" },
  { key: "shadow", label: "Shadow" },
];

export function isBgPreset(value?: string): boolean {
  return !!value && BG_PRESETS.some((b) => b.key === value);
}

let uid = 0;
export function newId(prefix = "n"): string {
  uid += 1;
  return `${prefix}_${Date.now().toString(36)}_${uid.toString(36)}`;
}

/* ------------------------------------------------------------------ */
/*  Default map — recreated from the hand-drawn planning board.        */
/* ------------------------------------------------------------------ */

type Seed = {
  id: string;
  title: string;
  x: number;
  y: number;
  status?: NodeStatus;
  role?: NodeRole;
  specId?: string;
  note?: string;
  w?: number;
};

// Spread factors applied to the hand-tuned seed coordinates so the default
// board has generous breathing room between boxes instead of feeling crammed.
const SPREAD_X = 1.32;
const SPREAD_Y = 1.16;

function specFromSeedId(id: string): string | undefined {
  if (id === "career" || id.startsWith("c_")) return "spec_career";
  if (id === "social" || id.startsWith("s_")) return "spec_social";
  if (id === "women" || id.startsWith("w_")) return "spec_women";
  if (id === "indep" || id.startsWith("i_")) return "spec_indep";
  if (
    id === "habits" ||
    id.startsWith("h_") ||
    id === "prod" ||
    id.startsWith("p_")
  ) {
    return "spec_habits";
  }
  if (
    id === "creative" ||
    id === "clean" ||
    id.startsWith("cl_") ||
    id === "hygiene" ||
    id.startsWith("hy_") ||
    id === "prog" ||
    id.startsWith("pr_") ||
    id === "exercise" ||
    id.startsWith("ex_")
  ) {
    return "spec_life";
  }
  return undefined;
}

function buildMap(
  title: string,
  specs: Spec[],
  seeds: Seed[],
  links: [string, string][]
): MindMap {
  const nodes: MapNode[] = seeds.map((s) => ({
    id: s.id,
    title: s.title,
    x: Math.round(s.x * SPREAD_X),
    y: Math.round(s.y * SPREAD_Y),
    status: s.status ?? "neutral",
    role: s.role ?? "item",
    specId: s.specId ?? specFromSeedId(s.id) ?? specs[0]?.id,
    note: s.note,
    w: s.w,
  }));
  const edges: MapEdge[] = links.map(([from, to], i) => ({
    id: `e_${i}_${from}_${to}`,
    from,
    to,
  }));
  return {
    version: STATE_VERSION,
    title,
    specs,
    activeSpecId: ALL_SPECS,
    nodes,
    edges,
  };
}

export function createDefaultMap(): MindMap {
  const career = "spec_career";
  const social = "spec_social";
  const women = "spec_women";
  const indep = "spec_indep";
  const habits = "spec_habits";
  const life = "spec_life";

  const specs: Spec[] = [
    { id: career, name: "Career", icon: "sword", accent: "#c8a24a", background: "gold" },
    { id: social, name: "Social", icon: "holy", accent: "#4aa3c8", background: "forest" },
    { id: women, name: "Women", icon: "fire", accent: "#c84a4a", background: "ember" },
    { id: indep, name: "Independence", icon: "shield", accent: "#c87a4a", background: "steel" },
    { id: habits, name: "Habits", icon: "lightning", accent: "#5fc84a", background: "forest" },
    { id: life, name: "Lifestyle", icon: "frost", accent: "#9b4ac8", background: "frost" },
  ];

  const seeds: Seed[] = [
    /* ---------------- Career Path ---------------- */
    { id: "career", title: "Career Path", x: 120, y: 90, role: "group", specId: career },
    { id: "c_elem", title: "Graduate Elementary School", x: 100, y: 160, status: "done" },
    { id: "c_mid", title: "Graduate Middle School", x: 100, y: 230, status: "done" },
    { id: "c_high", title: "Graduate High School", x: 100, y: 300, status: "done" },
    { id: "c_ba", title: "Graduate College & Attain BA", x: 100, y: 370, status: "done" },
    { id: "c_masters", title: "Masters Degree", x: 10, y: 450, status: "done" },
    { id: "c_job", title: "Find a Job", x: 210, y: 450, status: "done" },
    { id: "c_side", title: "Start a Side Hustle", x: 10, y: 530, status: "goal" },
    { id: "c_biz", title: "Start a Business", x: 10, y: 600, status: "goal" },
    { id: "c_50k", title: "Make over 50k", x: 210, y: 530, status: "done" },
    { id: "c_100k", title: "Make over 100k", x: 210, y: 600, status: "goal" },

    /* ---------------- Social Path ---------------- */
    { id: "social", title: "Social Path", x: 470, y: 40, role: "group" },
    { id: "s_friend", title: "Make a Friend", x: 470, y: 110, status: "done" },
    { id: "s_multi", title: "Make Multiple Friends", x: 390, y: 190, status: "done" },
    { id: "s_best", title: "Make a Best Friend", x: 620, y: 190, status: "done" },
    { id: "s_group", title: "Make a Friend Group", x: 390, y: 270, status: "done" },
    { id: "s_coolbest", title: "Make a Cool Best Friend", x: 620, y: 270, status: "done" },
    { id: "s_weekly", title: "Make a Friend Group That Hangs Out Every Week", x: 360, y: 350, status: "goal" },
    { id: "s_cool", title: "Make a Friend Group of Really Cool People", x: 590, y: 350, status: "special" },
    { id: "s_coolweekly", title: "Make a Friend Group That Goes Out Every Week and Are Really Cool People", x: 480, y: 440, status: "goal" },

    /* ---------------- Women Path ---------------- */
    { id: "women", title: "Women Path", x: 900, y: 90, role: "group" },
    { id: "w_online", title: "Make an Online Girlfriend", x: 830, y: 170, status: "done" },
    { id: "w_hold", title: "Hold a Girl's Hand", x: 1060, y: 170, status: "done" },
    { id: "w_real", title: "Make a Real Life Girlfriend", x: 830, y: 250, status: "done" },
    { id: "w_hug", title: "Hug a Girl", x: 1060, y: 250, status: "done" },
    { id: "w_irlbest", title: "Make an Irl Best Friend", x: 830, y: 330, status: "done" },
    { id: "w_coolirl", title: "Make a Cool Irl Best Friend", x: 760, y: 410, status: "goal" },
    { id: "w_weekly", title: "Make a Cool Irl Best Friend You Go Out With Every Week Irl", x: 990, y: 410, status: "done" },

    /* ---------------- Independence / Adulting ---------------- */
    { id: "indep", title: "Independence / Adulting", x: 470, y: 560, role: "group" },
    { id: "i_closet", title: "Have My Own Closet", x: 480, y: 640, status: "progress" },
    { id: "i_room", title: "Have My Own Room", x: 480, y: 710, status: "progress" },
    { id: "i_rent", title: "Rent a Place / Move Out", x: 480, y: 780, status: "progress" },
    { id: "i_own", title: "Own a Place", x: 480, y: 850, status: "goal" },

    /* ---------------- Habits ---------------- */
    { id: "habits", title: "Habits", x: 900, y: 560, role: "group" },
    { id: "h_small", title: "Small Actions During the Day", x: 720, y: 640, status: "progress" },
    { id: "h_alarm", title: "Disable Alarm Out of Bed", x: 720, y: 720, status: "progress" },
    { id: "h_posture", title: "Use Posture Stick for 10 Min", x: 720, y: 790, status: "progress" },
    { id: "h_daily", title: "Start a Daily Habit", x: 960, y: 640, status: "done" },
    { id: "h_365", title: "Keep a Habit for 365 Days", x: 960, y: 720, status: "done" },
    { id: "prod", title: "Productivity", x: 940, y: 810, role: "subgroup" },
    { id: "p_study", title: "Consistently Have 1 Hour of Study", x: 820, y: 890, status: "goal" },
    { id: "p_work", title: "Consistently Have 1 Hour of Work", x: 1060, y: 890, status: "goal" },

    /* ---------------- Creative / Cleanliness / Hygiene ---------------- */
    { id: "creative", title: "Creative", x: 1320, y: 90, role: "group" },
    { id: "clean", title: "Cleanliness", x: 1560, y: 90, role: "group" },
    { id: "cl_trash", title: "Pick Up One Piece of Trash", x: 1540, y: 170, status: "done" },
    { id: "hygiene", title: "Hygiene", x: 1360, y: 200, role: "subgroup" },
    { id: "hy_teeth", title: "Brush Your Teeth Every Day and Night", x: 1290, y: 290, status: "progress" },
    { id: "hy_shower", title: "Shower Every Mon / Wed / Fri", x: 1520, y: 290, status: "progress" },
    { id: "prog", title: "Progression", x: 1400, y: 380, role: "subgroup" },
    { id: "pr_micro", title: "Set a Microscopic Goal", x: 1390, y: 460, status: "progress" },
    { id: "pr_video", title: "Video On a Timer", x: 1600, y: 460, status: "progress" },
    { id: "exercise", title: "Exercise", x: 1500, y: 550, role: "subgroup" },
    { id: "ex_curl", title: "One Bicep Curl", x: 1480, y: 630, status: "goal" },
  ];

  const links: [string, string][] = [
    // Career
    ["career", "c_elem"],
    ["c_elem", "c_mid"],
    ["c_mid", "c_high"],
    ["c_high", "c_ba"],
    ["c_ba", "c_masters"],
    ["c_ba", "c_job"],
    ["c_masters", "c_side"],
    ["c_side", "c_biz"],
    ["c_job", "c_50k"],
    ["c_50k", "c_100k"],
    // Social
    ["social", "s_friend"],
    ["s_friend", "s_multi"],
    ["s_friend", "s_best"],
    ["s_multi", "s_group"],
    ["s_best", "s_coolbest"],
    ["s_group", "s_weekly"],
    ["s_group", "s_cool"],
    ["s_cool", "s_coolweekly"],
    // Women
    ["women", "w_online"],
    ["women", "w_hold"],
    ["w_online", "w_real"],
    ["w_hold", "w_hug"],
    ["w_real", "w_irlbest"],
    ["w_irlbest", "w_coolirl"],
    ["w_irlbest", "w_weekly"],
    // Independence
    ["indep", "i_closet"],
    ["i_closet", "i_room"],
    ["i_room", "i_rent"],
    ["i_rent", "i_own"],
    // Habits
    ["habits", "h_small"],
    ["habits", "h_daily"],
    ["h_small", "h_alarm"],
    ["h_alarm", "h_posture"],
    ["h_daily", "h_365"],
    ["h_365", "prod"],
    ["prod", "p_study"],
    ["prod", "p_work"],
    // Creative / Cleanliness / Hygiene
    ["clean", "cl_trash"],
    ["creative", "hygiene"],
    ["hygiene", "hy_teeth"],
    ["hygiene", "hy_shower"],
    ["hy_shower", "prog"],
    ["prog", "pr_micro"],
    ["pr_micro", "pr_video"],
    ["pr_video", "exercise"],
    ["exercise", "ex_curl"],
  ];

  const packed = organizeMap(buildMap("Life Talent Tree", specs, seeds, links));
  return { ...packed, nodes: withUniqueIcons(packed.nodes) };
}
