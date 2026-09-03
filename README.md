# Talent Forge

A decorated, video‑game‑style **talent tree builder** — design your own talent
trees, forge custom talents, spend points, and share your build. Styled after
classic MMO talent panels with thick brushed‑steel borders, textured icon slots,
gold trim, rivets, a dragon crest, and gryphon toolbar end‑caps.

![Talent Forge](public/assets/dragon-crest.png)

## Features

- **Build your own trees** – add, edit, delete talents; set name, icon,
  description, max rank, grid position, prerequisites, and point requirements.
- **Multiple trees (specs)** – WoW‑style spec tabs; add or remove trees, each
  with its own icon and accent color.
- **Point simulation** – left‑click to learn a rank, right‑click to unlearn.
  Tier gating (points required per row) and prerequisite arrows are enforced,
  with a global point budget.
- **Icon library + custom icons** – ships with hand‑made ability icons, or paste
  any image URL.
- **Save / Import / Export** – your build auto‑saves to `localStorage`; export to
  a JSON file and import it back or share it.
- **Fully decorated steel UI** – brushed‑metal panels, beveled talent slots,
  glowing rank states, tooltips, dragon + gryphon ornaments.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How to use

- **Edit Mode** (bottom toolbar) reveals empty `+` cells — click one to forge a
  new talent. Click an existing talent to edit it.
- **Tree Settings** (Edit Mode) or double‑click a spec tab to rename a tree,
  change its icon/accent color, or adjust the number of rows/columns.
- In play mode, **left‑click** a talent to spend a point and **right‑click** to
  refund one. **Budget** (top panel) sets your total available points.
- **Export / Import** (bottom toolbar) save and load builds as JSON files.

## Tech

- [Next.js](https://nextjs.org) (App Router) + React + TypeScript
- Tailwind CSS v4 with a custom steel design system in `src/app/globals.css`

## Deploy to Vercel

This is a standard Next.js app and deploys to Vercel with zero configuration:

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In [Vercel](https://vercel.com/new), import the repo — the framework preset is
   detected automatically.
3. Click **Deploy**. No environment variables are required.

## Project structure

```
src/
  app/
    layout.tsx        # fonts + metadata
    page.tsx          # app shell, state, persistence, toolbar
    globals.css       # the steel design system
  components/
    TalentTreeView.tsx    # grid layout + prerequisite arrows + tooltips
    TalentSlot.tsx        # a single beveled steel talent slot
    Tooltip.tsx           # hover tooltip
    TalentEditorModal.tsx # add/edit a talent
    TreeSettingsModal.tsx # add/edit a tree
  lib/
    types.ts          # data model
    presets.ts        # default demo build + icon presets
    talentLogic.ts    # spend/refund rules, tier gating, status
    storage.ts        # localStorage + import/export
public/assets/        # generated steel textures, dragon, gryphon, icons
```
