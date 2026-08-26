# CRT/HC-OSD TV Widget — Design & Milestone Doc

> A self-contained OBS browser-source widget emulating a real CRT/VHS TV.
> Starts as an ambient "turn on the TV" CRT screen, grows into an **interactive
> Friends Channels hub** where you flip between friends and watch who's live.

**Widget root:** `E:\git\widgets\crt-tv\`
**Status:** Phase 1 done (see below). **Current model:** ornith-15
**Font target:** `VCR OSD Mono` (or `VT323`/`Press Start 2P` as fallbacks). NOT a modern HD font.

---

## 1. Design Principles

1. **Authenticity first.** This is a CRT + VHS machine, not an HD screen. Emulate the
   physical medium before adding modern glitches.
2. **Two distinct "eras" of distortion:**
   - **VHS/CRT era:** scanlines, roll band, tracking jitter, convergence/RGB fringing,
     phosphor glow, curvature vignette, snow, dropout streaks, tape wobble,
     color bleed, "no signal" blue screen.
   - **Modern-era:** pixelation, bandwidth/network drop (macroblocks, buffering ring,
     resolution downshift like `1080p → 360p`), datamosh smear, digital tear,
     buffering/`-408` style cuts, glitch-art block pops.
3. **VCR OSD chrome only.** All on-screen text uses the VCR OSD Mono look: green
   monospace REC dots, cyan channel/source tags, amber time, tape counter.
4. **Transparent-friendly.** The bezel fills black; OBS source can go transparent so
   only the glowing well shows.
5. **Zero external hard-dependency at start.** Phase 0–1 are pure canvas, work offline.
   Networking (Phase 3+) is optional and degrades gracefully.

---

## 2. Files (current)

| File | Purpose |
|------|---------|
| `crt-tv.html` | Structure: bezel, well, screen canvas, grille, CSS vignette/reflection |
| `crt-tv.js`   | Canvas renderer: blue screen, scanlines, roll/tracking, OSD, transport |
| `_preview.png`| Playwright screenshot reference (do not commit as source of truth) |
| `DESIGN.md`   | This doc |

**Current state:** Phase 1 done. Center pixel confirmed rendered blue `(35,70,114)`.

---

## 3. Milestones

### Phase 0 — Foundations (DONE)
- [x] Self-contained HTML/JS scaffold, transparent-friendly
- [x] Node syntax check passes
- [x] Playwright render confirms canvas draws

### Phase 1 — Authentic CRT/VHS Core (DONE, base build)
- [x] Blue "broadcast" test pattern
- [x] Scanlines + roll band + RGB fringing
- [x] Source cycling `TV → AV → VHS` (each with different degrade/static)
- [x] Blinking `●REC`, `▶ PLAY`, tape counter
- [x] Tracking knob (drag), channel change (`↑/↓`, Space play/pause)

### Phase 2 — Deepen Authenticity (NEXT)
- [x] **Font swap** to `VCR OSD Mono` (self-hosted `@font-face` in `fonts/`, `VT323` web fallback)
- [x] VHS **tracking band** becomes a real wobble + snow column that snaps back on drag
- [ ] **Signal-loss sequence** (TV off → blue → rolling snow → dead static)
- [ ] **Phosphor warm-up** fade-in on load
- [ ] **Audio-reactive** option (optional, OBS browser source mic capture is tricky — defer)

### Phase 3 — Glitch Library (modern era)
- [ ] Pixelation / macroblock block-pop
- [ ] Bandwidth/network: buffering ring, `360p→1080p` resolution downshift, datamosh smear
- [ ] Digital tear + glitch-art pops
- [ ] A small `glitches.js` module + a `transition` API to trigger any glitch on cue
- [ ] **Transition modes** for OBS: "turn on the TV" (black→blue→static→lock) and
      "loss of signal" (reverse) for scene changes

### Phase 4 — Friends Channels Hub (THE BIG ONE)
- [x] `friends.json` data model (seed list in `crt-tv.js` `CHANNELS` — see §4)
- [x] **Channel-flip UI:** 6 friend tiles; flip with `↑/↓`, pick via Enter grid menu
- [x] Per-tile **status (MANUAL, no live-detection):** `LIVE` / `OFFLINE`
  - `LIVE`  → content in the CRT well (blue broadcast; embed/local in Phase 5)
  - `OFFLINE` → **"Technical Difficulties"** SMPTE color bars + `SIGNAL LOST` text + tone
- [x] Channel switch FX: **brief white flash + swap beep** + ~150ms static (analog tuning)
- [x] Channel grid menu (Enter to open, Esc to close; click a tile to switch)
- [ ] **"Watch with my chat"** wiring: selecting a live friend routes that friend's
      stream/chat into the TV (see Phase 5 integration)

### Phase 5 — Embed / Media Inside the Well (OPTIONAL)
- [ ] Show embed (`<iframe>`) or local `<video>` inside the CRT well for `LIVE` channels
- [ ] Graceful fallback if media fails to load (→ treat as OFFLINE)
- [ ] **"Offline" is purely local:** a channel is OFFLINE iff it has NO playable media.
      No live-detection API, no network, no tokens. See §6.

### Phase 6 — Polish
- [ ] Bezel/brand styling → full **VCR unit** with real transport buttons + speaker grille
- [ ] Presets saved per "source mode"
- [ ] README + OBS setup instructions
- [ ] Zip package `crt-tv.zip` for easy OBS import

---

## 4. Friends Channels — Data Model (Phase 4)

Design for a `friends.json` seed file (can be edited without code):

```json
{
  "tv": {
    "brand": "VCR-OSD",
    "font": "VCR OSO Mono",
    "channels": [
      { "id": "twitch:nightbot",   "name": "nightbot",  "handle": "@nightbot",  "type": "twitch" },
      { "id": "twitch:friend2",    "name": "friend2",   "handle": "@friend2",   "type": "twitch" },
      { "id": "local:clip",        "name": "CLIP_01",   "handle": "local",      "type": "local", "src": "clip.mp4" }
    ]
  }
}
```

Each channel knows:
- `type`: `local` (mp4/webm file), `url` (iframe embed) — **no `twitch` live type**
- `name`/`handle`: shown on the tile and in the OSD
- `status`: **manual** — a channel is `LIVE` if it has playable media, else `OFFLINE`
  (no live-detection API). See §6.

**Decisions locked so far (see §6):** no live detection; offline = no playable media.

---

## 5. Channel-Swap FX (LOCKED decision — see §8)

Every channel change mimics a real analog TV:

- **White flash:** full-frame white overlay ramping ~90–130 ms (classic channel change).
- **Swap beep:** ~40–60 ms WebAudio square-wave tone (no audio file) — higher pitch for
  CH+, lower for CH−, or a fixed `thunk`.
- **Tuning gap:** ~150 ms of dead static between the two channels so it reads as
  "tuning" not a hard cut.
- Offline channel = color bars + tone "Technical Difficulties" screen.

Note: `AudioContext` created lazily on first user gesture (autoplay policy). The
`channelFlip` action plays flash + beep + static automatically.

---

## 6. Transition API sketch (Phase 3)

```js
// used by OBS "Scene Transitions" via browser-source JS triggers (or manual)
CrtTV.transition('turnOn');   // black -> blue -> static -> lock
CrtTV.transition('glitch');   // modern pixelation/datamash burst
CrtTV.transition('signalLost'); // -> rolling snow -> dead static
CrtTV.channelFlip(0);         // Phase 4: flip to channel 0
```

---

## 7. Open Decisions (need your input)

1. **Platform / media type (Phase 5):** Twitch-only, or YouTube/local clips too?
   (Decides embed `<iframe>` vs local `<video>`.) — **deferred; offline tiles work
   without any network.**
2. **Friend list:** Want me to seed a real list of your friends' usernames so the hub
   is populated on first run, or ship it empty for you to fill in `friends.json`?

**Locked (no decision needed):** no live detection. Offline = a channel with no playable
media → shows the Technical Difficulties color-bars screen. 100% offline-capable.

---

## 8. Handoff Notes (for the next agent)

- **Current working baseline:** `Phase 1` renders correctly. Verify with Playwright
  on a fresh port before editing (`python -m http.server` then Playwright navigate).
- **Do NOT** introduce HD fonts — VCR OSD Mono is the required look.
- **Next step recommended:** **Phase 2, item 2** = real VHS tracking band (snow wobble + snap-back).
- Windows-only gotchas: use native `E:\` paths; background servers hang the Bash tool —
  use `Start-Process -PassThru` (or `Start-Process python ... -WindowStyle Hidden`)
  and kill by PID. `file://` and OBS browser source need an HTTP server.
