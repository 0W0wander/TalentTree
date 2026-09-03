"use client";

import type { AppState, Talent, TalentTree } from "@/lib/types";
import {
  rankOf,
  requiredPointsFor,
  pointsInTree,
  statusOf,
} from "@/lib/talentLogic";

type Props = {
  state: AppState;
  tree: TalentTree;
  talent: Talent;
  x: number;
  y: number;
  editMode: boolean;
};

export default function Tooltip({ state, tree, talent, x, y, editMode }: Props) {
  const rank = rankOf(state, talent.id);
  const status = statusOf(state, tree, talent);
  const required = requiredPointsFor(state, talent);
  const spent = pointsInTree(state, tree);
  const prereq = talent.requires
    ? tree.talents.find((t) => t.id === talent.requires)
    : undefined;
  const prereqMet =
    !prereq || rankOf(state, prereq.id) >= prereq.maxRank;

  // keep tooltip on-screen
  const left = Math.min(x + 18, (typeof window !== "undefined" ? window.innerWidth : 1200) - 306);
  const top = Math.min(y + 16, (typeof window !== "undefined" ? window.innerHeight : 800) - 220);

  return (
    <div className="tt" style={{ left, top }}>
      <h4>{talent.name || "Unnamed Talent"}</h4>
      <div className="tt-rank">
        Rank {rank}/{talent.maxRank}
      </div>
      <div className="tt-desc">{talent.description || "No description."}</div>

      {required > 0 && (
        <div className={`tt-req ${spent >= required ? "ok" : ""}`}>
          Requires {required} points in {tree.name}
        </div>
      )}
      {prereq && (
        <div className={`tt-req ${prereqMet ? "ok" : ""}`}>
          Requires {prereq.maxRank} point{prereq.maxRank > 1 ? "s" : ""} in {prereq.name}
        </div>
      )}

      <div className="tt-hint">
        {editMode
          ? "Click to edit this talent"
          : status === "maxed"
          ? "Right-click to unlearn"
          : "Left-click to learn · Right-click to unlearn"}
      </div>
    </div>
  );
}
