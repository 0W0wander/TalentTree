"use client";

import { resolveIcon } from "@/lib/presets";
import type { Talent } from "@/lib/types";
import type { TalentStatus } from "@/lib/talentLogic";

type Props = {
  talent: Talent;
  rank: number;
  status: TalentStatus;
  accent: string;
  editMode: boolean;
  onLeftClick: () => void;
  onRightClick: () => void;
  onEnter: (e: React.MouseEvent) => void;
  onMove: (e: React.MouseEvent) => void;
  onLeave: () => void;
};

export default function TalentSlot({
  talent,
  rank,
  status,
  accent,
  editMode,
  onLeftClick,
  onRightClick,
  onEnter,
  onMove,
  onLeave,
}: Props) {
  const isLocked =
    status === "locked-tier" ||
    status === "locked-prereq" ||
    status === "locked-budget";

  const cls = [
    "talent-slot",
    editMode ? "is-edit" : "",
    status === "maxed" ? "is-maxed" : "",
    status === "partial" ? "is-partial" : "",
    status === "available" ? "is-available" : "",
    isLocked ? "is-locked" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      style={{ ["--accent" as string]: accent }}
      onClick={onLeftClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onRightClick();
      }}
      onMouseEnter={onEnter}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div className="slot-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={resolveIcon(talent.icon)} alt={talent.name} draggable={false} />
      </div>
      <div className="rank-badge">
        {rank}/{talent.maxRank}
      </div>
    </div>
  );
}
