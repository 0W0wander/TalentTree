import type { MindMap, MapNode, MapEdge, NodeRole, NodeStatus } from "./types";
import { ROOT_ID, ROOT_VIEW, STATE_VERSION, roleOf } from "./types";
import { newId } from "./presets";

/**
 * A compact, indentation-based text format for the whole tree that is easy for
 * an AI (or a human) to author by hand, and that `importState` accepts. It is
 * the round-trip partner of {@link serializeOutline} — what we emit is exactly
 * what {@link parseOutline} reads back.
 */

/** Human-readable description of the outline grammar, embedded in AI prompts. */
export const OUTLINE_SPEC = `TALENT TREE OUTLINE FORMAT
==========================
The tree is written as a plain-text outline, one node per line.

Hierarchy & indentation
- Indentation sets parent/child: use exactly 2 spaces per level of depth.
- A line is a child of the nearest line above it that is indented less.
- The FIRST line (0 spaces) is the single tree root. Keep exactly one root and
  nest everything else beneath it. (The default root title is "Talent goals".)

Node lines
- Every node line starts with "- " (a dash and a space) after its indentation.
- After "- " comes the node's Title (free text; may contain spaces, "/", "&",
  digits, etc. Avoid the literal substring " {" inside a title).
- A node may end with an optional attribute block in curly braces:
      - Title {attr; attr; ...}
  Attributes are separated by semicolons ";". Recognised attributes:
    * role  -> one of:  group  |  subgroup  |  set
               (omit for a normal item box; group=black, subgroup=white,
                set=bronze — these are organisational labels, not goals)
    * status-> one of:  done | progress | goal | special
               (omit for a plain/neutral item. Only items carry a status.
                done = achieved, progress = "used to / did before",
                goal = not yet / target, special = stand-out)
    * habit -> the token  habit  marks a box as done-every-day
    * pin   -> the token  pin  surfaces the node in the header as a focusable
               specialization
    * note  -> note=Some extra text  (a supporting line shown under the title)
- Blank lines are ignored. Lines beginning with "//" are comments and ignored.

Examples
- Talent goals
  - Career Path {group; pin}
    - Graduate High School {done}
    - Start a Business {goal}
  - Habits Everyday {group; pin}
    - Discipline {subgroup}
      - Brush teeth morning and night {progress; habit}
`;

function downChildren(map: MindMap): Map<string, string[]> {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const kids = new Map<string, string[]>();
  for (const e of map.edges) {
    if (e.kind === "side") continue;
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    const list = kids.get(e.from);
    if (list) list.push(e.to);
    else kids.set(e.from, [e.to]);
  }
  // Row-major order (top row first, left-to-right within a row) matches how the
  // organiser iterates children and how the outline is read, so serialize →
  // import → serialize is stable.
  for (const [, list] of kids) {
    list.sort((a, b) => {
      const na = byId.get(a)!;
      const nb = byId.get(b)!;
      return na.y - nb.y || na.x - nb.x;
    });
  }
  return kids;
}

function attrsFor(n: MapNode): string {
  const parts: string[] = [];
  const r = roleOf(n);
  if (r !== "item") parts.push(r);
  if (r === "item" && n.status && n.status !== "neutral") parts.push(n.status);
  if (n.habit) parts.push("habit");
  if (n.pinned) parts.push("pin");
  if (n.note) parts.push(`note=${n.note.replace(/[\r\n]+/g, " ").trim()}`);
  return parts.length ? ` {${parts.join("; ")}}` : "";
}

/** Serialize the whole tree to the outline format described by OUTLINE_SPEC. */
export function serializeOutline(map: MindMap): string {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const kids = downChildren(map);
  const lines: string[] = [];
  const seen = new Set<string>();

  function walk(id: string, depth: number) {
    const n = byId.get(id);
    if (!n || seen.has(id)) return;
    seen.add(id);
    const indent = "  ".repeat(depth);
    const attrs = id === ROOT_ID ? "" : attrsFor(n);
    lines.push(`${indent}- ${n.title || "Untitled"}${attrs}`);
    for (const c of kids.get(id) ?? []) walk(c, depth + 1);
  }

  const hasRoot = byId.has(ROOT_ID);
  if (hasRoot) walk(ROOT_ID, 0);
  // Any node not reached from the root becomes a top-level branch on re-import.
  for (const n of map.nodes) {
    if (!seen.has(n.id)) walk(n.id, hasRoot ? 1 : 0);
  }
  return lines.join("\n");
}

const ROLE_TOKENS = new Set<NodeRole>(["group", "subgroup", "set"]);
const STATUS_TOKENS = new Set<NodeStatus>([
  "done",
  "progress",
  "goal",
  "special",
]);

/**
 * Parse the outline format into a raw MindMap. Ids and positions are (re)generated;
 * callers should run the result through `normalize`/`organizeMap` to lay it out.
 */
export function parseOutline(text: string): MindMap {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const stack: { depth: number; id: string }[] = [];
  let rootId: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, "  ");
    if (!line.trim()) continue;
    const indent = (line.match(/^ */)?.[0].length ?? 0);
    let content = line.slice(indent);
    if (content.startsWith("//")) continue;
    content = content.replace(/^[-*]\s?/, "").trim();
    if (!content) continue;

    const depth = Math.round(indent / 2);

    let title = content;
    let attrText = "";
    if (content.endsWith("}")) {
      const idx = content.lastIndexOf(" {");
      if (idx >= 0) {
        title = content.slice(0, idx).trim();
        attrText = content.slice(idx + 2, content.length - 1);
      }
    }

    let role: NodeRole = "item";
    let status: NodeStatus = "neutral";
    let habit = false;
    let pinned = false;
    let note: string | undefined;
    let icon: string | undefined;
    for (const tokenRaw of attrText.split(";")) {
      const token = tokenRaw.trim();
      if (!token) continue;
      const low = token.toLowerCase();
      if (ROLE_TOKENS.has(low as NodeRole)) role = low as NodeRole;
      else if (STATUS_TOKENS.has(low as NodeStatus)) status = low as NodeStatus;
      else if (low === "habit") habit = true;
      else if (low === "pin" || low === "pinned") pinned = true;
      else if (low.startsWith("note=")) note = token.slice(5).trim() || undefined;
      else if (low.startsWith("icon=")) icon = token.slice(5).trim() || undefined;
    }

    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    let parent: string | null = stack.length ? stack[stack.length - 1].id : null;
    const isRoot: boolean = parent === null && rootId === null;
    if (parent === null && !isRoot) parent = rootId; // extra top-level → under root

    const id: string = isRoot ? ROOT_ID : newId("n");
    if (isRoot) rootId = id;

    const node: MapNode = {
      id,
      title: title || (isRoot ? "Talent goals" : "Untitled"),
      status: isRoot ? "neutral" : status,
      role: isRoot ? "group" : role,
      x: 0,
      y: 0,
    };
    if (!isRoot) {
      if (habit) node.habit = true;
      if (pinned) node.pinned = true;
    }
    if (note) node.note = note;
    if (icon) node.icon = icon;

    nodes.push(node);
    if (parent) edges.push({ id: newId("e"), from: parent, to: id, kind: "down" });
    stack.push({ depth, id });
  }

  if (!rootId) {
    return {
      version: STATE_VERSION,
      title: "Talent goals",
      nodes: [
        { id: ROOT_ID, title: "Talent goals", status: "neutral", role: "group", x: 0, y: 0 },
      ],
      edges: [],
      activeView: ROOT_VIEW,
      layoutVersion: 0,
    };
  }

  return {
    version: STATE_VERSION,
    title: nodes.find((n) => n.id === ROOT_ID)?.title || "Talent goals",
    nodes,
    edges,
    activeView: ROOT_VIEW,
    layoutVersion: 0,
  };
}

/**
 * Build the copy-ready prompt: format spec + the current tree serialized in that
 * format + framing that tells the AI to reply ONLY with the same format.
 */
export function buildAiPrompt(map: MindMap): string {
  const tree = serializeOutline(map);
  return `You are helping me reorganize my personal "Talent Tree" — a single branching tree of goals, habits, and milestones. It is described in the plain-text outline format specified below. Read the format spec, then read my CURRENT TREE, then apply the reorganization instructions I add at the very bottom.

============================================================
FORMAT SPEC
============================================================
${OUTLINE_SPEC}
============================================================
CURRENT TREE
============================================================
${tree}
============================================================
HOW TO RESPOND
============================================================
- Apply MY REORGANIZATION INSTRUCTIONS (below) to the CURRENT TREE.
- Reply with ONLY the full, reorganized tree written in the exact outline
  format described above.
- Do NOT include any prose, explanations, headings, or Markdown code fences.
  Output must be nothing but valid outline lines.
- Keep exactly one root line at indentation 0 (the "Talent goals" root); nest
  everything else beneath it with 2 spaces per level.
- Preserve nodes unless I ask you to remove them; you may retitle, re-parent,
  re-order, change status, and add/remove the habit/pin/role/note attributes.
- The result must parse cleanly when pasted straight into the app's Import.

============================================================
MY REORGANIZATION INSTRUCTIONS
============================================================
`;
}
