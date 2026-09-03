"use client";

import { useState } from "react";
import type { AppState, Talent, TalentTree } from "@/lib/types";
import { rankOf, statusOf, canAddPoint } from "@/lib/talentLogic";
import TalentSlot from "./TalentSlot";
import Tooltip from "./Tooltip";

export const CELL = 62;
export const GAP_X = 44;
export const GAP_Y = 40;
export const PAD = 30;

export function centerX(col: number) {
  return PAD + col * (CELL + GAP_X) + CELL / 2;
}
export function centerY(row: number) {
  return PAD + row * (CELL + GAP_Y) + CELL / 2;
}
export function boardWidth(cols: number) {
  return PAD * 2 + cols * CELL + (cols - 1) * GAP_X;
}
export function boardHeight(rows: number) {
  return PAD * 2 + rows * CELL + (rows - 1) * GAP_Y;
}

type Props = {
  state: AppState;
  tree: TalentTree;
  editMode: boolean;
  onAddPoint: (talentId: string) => void;
  onRemovePoint: (talentId: string) => void;
  onEditTalent: (talent: Talent) => void;
  onAddTalent: (row: number, col: number) => void;
};

type Hover = { talent: Talent; x: number; y: number } | null;

export default function TalentTreeView({
  state,
  tree,
  editMode,
  onAddPoint,
  onRemovePoint,
  onEditTalent,
  onAddTalent,
}: Props) {
  const [hover, setHover] = useState<Hover>(null);

  const w = boardWidth(tree.cols);
  const h = boardHeight(tree.rows);

  const byPos = new Map<string, Talent>();
  for (const t of tree.talents) byPos.set(`${t.row}:${t.col}`, t);

  const talentById = new Map(tree.talents.map((t) => [t.id, t]));

  return (
    <div className="relative" style={{ width: w, height: h }}>
      {/* Tier lines + labels */}
      {Array.from({ length: tree.rows }).map((_, row) => {
        const req = row * state.pointsPerTier;
        return (
          <div
            key={`tier-${row}`}
            className="absolute left-0 right-0 flex items-center gap-2"
            style={{ top: centerY(row) - CELL / 2 - 12, height: 1 }}
          >
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[rgba(215,180,90,0.18)] to-transparent" />
            <span className="font-title text-[10px] tracking-wider text-[rgba(215,180,90,0.55)] whitespace-nowrap">
              Tier {row + 1}{req > 0 ? ` · ${req} pts` : ""}
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[rgba(215,180,90,0.18)] to-transparent" />
          </div>
        );
      })}

      {/* Prerequisite connectors */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={w}
        height={h}
        style={{ zIndex: 1 }}
      >
        <defs>
          <marker
            id={`arrow-active-${tree.id}`}
            markerWidth="9"
            markerHeight="9"
            refX="6"
            refY="4.5"
            orient="auto"
          >
            <path d="M0,0 L9,4.5 L0,9 Z" fill="#6fe36a" />
          </marker>
          <marker
            id={`arrow-idle-${tree.id}`}
            markerWidth="9"
            markerHeight="9"
            refX="6"
            refY="4.5"
            orient="auto"
          >
            <path d="M0,0 L9,4.5 L0,9 Z" fill="#5a5f69" />
          </marker>
        </defs>
        {tree.talents
          .filter((t) => t.requires && talentById.has(t.requires))
          .map((t) => {
            const from = talentById.get(t.requires!)!;
            const active = rankOf(state, from.id) >= from.maxRank;
            const x1 = centerX(from.col);
            const y1 = centerY(from.row);
            const x2 = centerX(t.col);
            const y2 = centerY(t.row);

            // shorten so the arrow head sits just outside the target slot
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy) || 1;
            const off = CELL / 2 + 8;
            const ex = x2 - (dx / len) * off;
            const ey = y2 - (dy / len) * off;
            const sx = x1 + (dx / len) * (CELL / 2 + 2);
            const sy = y1 + (dy / len) * (CELL / 2 + 2);

            return (
              <line
                key={`conn-${t.id}`}
                x1={sx}
                y1={sy}
                x2={ex}
                y2={ey}
                stroke={active ? "#6fe36a" : "#5a5f69"}
                strokeWidth={active ? 3 : 2.5}
                strokeLinecap="round"
                markerEnd={`url(#arrow-${active ? "active" : "idle"}-${tree.id})`}
                opacity={active ? 0.95 : 0.55}
              />
            );
          })}
      </svg>

      {/* Empty cells (edit mode only) */}
      {editMode &&
        Array.from({ length: tree.rows }).map((_, row) =>
          Array.from({ length: tree.cols }).map((__, col) => {
            if (byPos.has(`${row}:${col}`)) return null;
            return (
              <div
                key={`empty-${row}-${col}`}
                className="absolute"
                style={{
                  left: centerX(col) - CELL / 2,
                  top: centerY(row) - CELL / 2,
                  zIndex: 2,
                }}
              >
                <div
                  className="empty-slot"
                  onClick={() => onAddTalent(row, col)}
                  title="Add a talent here"
                >
                  +
                </div>
              </div>
            );
          })
        )}

      {/* Talent slots */}
      {tree.talents.map((t) => {
        const rank = rankOf(state, t.id);
        const status = statusOf(state, tree, t);
        return (
          <div
            key={t.id}
            className="absolute"
            style={{
              left: centerX(t.col) - CELL / 2,
              top: centerY(t.row) - CELL / 2,
              zIndex: 3,
            }}
          >
            <TalentSlot
              talent={t}
              rank={rank}
              status={status}
              accent={tree.accent}
              editMode={editMode}
              onLeftClick={() => {
                if (editMode) onEditTalent(t);
                else if (canAddPoint(state, tree, t)) onAddPoint(t.id);
              }}
              onRightClick={() => {
                if (!editMode) onRemovePoint(t.id);
              }}
              onEnter={(e) => setHover({ talent: t, x: e.clientX, y: e.clientY })}
              onMove={(e) =>
                setHover((prev) =>
                  prev ? { ...prev, x: e.clientX, y: e.clientY } : prev
                )
              }
              onLeave={() => setHover(null)}
            />
          </div>
        );
      })}

      {hover && (
        <Tooltip
          state={state}
          tree={tree}
          talent={hover.talent}
          x={hover.x}
          y={hover.y}
          editMode={editMode}
        />
      )}
    </div>
  );
}
