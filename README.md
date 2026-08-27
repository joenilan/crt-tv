# CRT/HC-OSD TV Widget

A self-contained OBS browser-source widget that emulates a retro CRT/VHS TV. Starts as an ambient "turn on the TV" CRT screen and grows into an interactive **Friends Channels** hub.

## Features

- **Authentic CRT/VHS aesthetics**: scanlines, roll band, tracking jitter, phosphor warm-up, signal-loss sequence
- **Glitch library**: modern-era effects (pixelate, datamash, tear, buffer, downshift)
- **Friends Channels hub**: flip through 6 friend channels with analog tuning FX
- **Media playback**: local videos (mp4/webm) drawn to canvas, remote iframe embeds
- **Transport controls**: VCR-style buttons (PLAY, PAUSE, STOP, REWIND, FAST FORWARD, EJECT)
- **Presets**: saves channel selection and tracking position to localStorage

## Files

| File | Purpose |
|------|---------|
| `crt-tv.html` | Widget structure + CSS |
| `crt-tv.js` | Main widget logic |
| `glitches.js` | Glitch effects library |
| `render.mjs` | Playwright screenshot renderer |
| `media/` | Demo video clips |
| `fonts/` | Self-hosted VCR OSD Mono font |
| `DESIGN.md` | Design doc and milestones |
| `AGENTS.md` | Agent working notes |

## OBS Setup

1. **Extract** `crt-tv.zip` to a folder (e.g., `C:\obs\crt-tv\`)
2. In OBS, add a **Browser Source**:
   - URL: `file:///C:/obs/crt-tv/crt-tv.html`
   - Width: `1920`, Height: `1080`
   - Custom CSS (optional): `body { background: transparent; }`
3. The widget will auto-center and fill the source

## Controls

- **Arrow Up/Down**: Flip channels
- **Enter**: Open/close channel grid menu
- **Click screen**: Focus grid (if open)
- **Drag screen**: Tracking wobble (VHS tracking knob)
- **Transport buttons**: PLAY, PAUSE, STOP, etc.

## API (OBS JS triggers)

```js
// Turn on TV (phosphor warm-up)
CrtTV.transition('turnOn');

// Signal loss (TV off)
CrtTV.transition('signalLoss');

// Modern glitch burst
CrtTV.transition('glitch');

// Single glitch effects
CrtTV.transition('pixelate');
CrtTV.transition('datamash');
CrtTV.transition('tear');
CrtTV.transition('buffer');
CrtTV.transition('downshift');

// Direct channel switch
CrtTV.swapChannel(2);

// Toggle grid menu
CrtTV.toggleGrid();
```

## Customization

Edit `CHANNELS` array in `crt-tv.js` to add your friends:

```js
const CHANNELS = [
    { id: 'friend1', name: 'Friend 1', handle: '@friend1', media: { type: 'local', src: './media/clip.mp4' } },
    { id: 'friend2', name: 'Friend 2', handle: '@friend2', media: null }, // OFFLINE
];
```

- `media: null` → OFFLINE (Technical Difficulties color bars)
- `media: { type: 'local', src: '...' }` → local video file
- `media: { type: 'embed', url: '...' }` → remote iframe

## Generation

To regenerate test clips:

```bash
ffmpeg -f lavfi -i testsrc2=duration=12:size=1280x720 -c:v libx264 -pix_fmt yuv420p media/test.mp4
ffmpeg -f lavfi -i testsrc2=duration=8:size=1280x720 -c:v libvpx-vp9 media/test.webm
```

## Development

Requires Node.js and Playwright:

```bash
npm install
node render.mjs  # generates renders/frame.png
node render.mjs --channel 3  # renders specific channel
```

## License

MIT
