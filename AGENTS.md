# AGENTS.md — CRT/HC-OSD TV Widget

Multi-agent working repo for a self-contained **OBS browser-source widget** that emulates a
real CRT/VHS TV and grows into an interactive "Friends Channels" hub.

## TL;DR for a new agent
- **Read `DESIGN.md` first.** It is the single source of truth for design, milestones, locked
  decisions, and handoff notes. This file just points you there and records repo conventions.
- **Source of truth = code** (`crt-tv.html` + `crt-tv.js`). The PNGs in `renders/` and
  `baseline_fontswap.png` are visual references only — regenerate them, don't hand-edit.
- **Font:** must be `VCR OSD Mono` (fallback `VT323`). Never introduce a modern HD font.
- **CI skip is mandatory on push** (see "Git workflow" below).

## Project map
| File | Purpose |
|------|---------|
| `DESIGN.md` | Design, milestones, locked decisions, handoff notes — read before editing |
| `crt-tv.html` | Structure: bezel, well, screen canvas, grille, vignette/reflection CSS |
| `crt-tv.js` | Canvas renderer: blue screen, scanlines, roll/tracking, OSD, transport |
| `render.mjs` | Playwright render -> `renders/` (starts a local HTTP server, takes a screenshot) |
| `diag.mjs` / `probe.mjs` | Diagnostic probes |
| `renders/` | Generated screenshot references (regenerate, do not hand-edit) |
| `baseline_fontswap.png` | Font-swap visual reference |

## Current state
- Phase 1 done; Phase 4 (Friends Channels hub) done; **Phase 2 (deepen authenticity) in progress**
  (item 1 = VCR OSD Mono font swap, done; item 2 = VHS tracking band, done; item 3 = signal-loss sequence, done; item 4 = phosphor warm-up, done; item 5 open).
  - Demo channel list inlined in `crt-tv.js` `CHANNELS` (no `friends.json` yet): peeshaaaa, itzdribz, bessvibes, sery_bot (blue, live test), nightowl (blue), retrocat.
- Recommended next step: `DESIGN.md` Phase 2 item 5 — **audio-reactive option** (deferred).

## How to verify changes
- **Syntax check:** `node --check crt-tv.js`
- **Render reference (visual):** `node render.mjs` (writes `renders/frame.png`). It spins up a
  one-shot local HTTP server on an ephemeral port and closes it — no background server left running.
  On Windows, background servers hang the Bash tool; prefer this script over `python -m http.server`.

## Git workflow (IMPORTANT)
- **CI is skipped on every push.** Always push with skip-ci:
  ```
  git push -u origin main --push-option=skip-ci
  ```
  (`-o skip-ci` / `--push-option=skip-ci` — use whichever your git version accepts.)
- Commit only intended files; keep the repo focused on source. The `renders/*.png` and
  `baseline_fontswap.png` are committed as visual references, not source of truth.
- Windows gotcha: use native `E:\` paths; keep servers foreground/one-shot (see render.mjs).

## Locked decisions (do not re-litigate)
- **No live detection.** A channel is `LIVE` iff it has playable media (`media !== null`),
  else `OFFLINE` ("Technical Difficulties" color bars). 100% offline-capable, no network/tokens.
- **VCR OSD Mono only** — no modern HD fonts.
- **Channel-swap FX:** brief white flash + swap beep + ~150ms dead static (analog tuning).
