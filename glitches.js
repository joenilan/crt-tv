// Modern-era glitch library for the CRT/HC-OSD widget.
// Pure canvas effects (no DOM, no media, no network) so the widget stays
// offline-capable. Effects are triggered through CrtTV.transition('glitch*').
//
// Each effect: (ctx, W, H, t) => { draws ONE frame of the effect }
//   ctx  - the screen canvas 2d context
//   W,H  - internal render resolution
//   t    - elapsed ms since the effect started (used for spinning ring, etc.)
(() => {
    'use strict';
    const rand = () => Math.random();
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

    const effects = {};

    // ---- Pixelation / macroblock block-pop -----------------------------
    // Slice the frame into shifting macroblocks that flash/pop — the classic
    // "broken stream" block-art burst.
    effects.pixelate = (ctx, W, H) => {
        const cw = 14 + Math.floor(rand() * 30);
        const ch = cw;
        const cols = Math.ceil(W / cw), rows = Math.ceil(H / ch);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (rand() > 0.85) continue; // drop some blocks
                const bw = cw + Math.floor(rand() * 8 - 4);
                const bh = ch + Math.floor(rand() * 8 - 4);
                const x = c * cw + Math.floor((rand() - 0.5) * 12);
                const y = r * ch + Math.floor((rand() - 0.5) * 12);
                ctx.fillStyle = rand() > 0.5
                    ? `rgba(255,255,255,${0.15 + rand() * 0.3})`
                    : `rgba(24,64,128,${0.25 + rand() * 0.35})`;
                ctx.fillRect(x, y, bw, bh);
            }
        }
    };

    // ---- Datamosh smear -------------------------------------------------
    // Pull a horizontal band and offset it (smear), the hallmark of a broken
    // keyframe / datamosh.
    effects.datamash = (ctx, W, H) => {
        const n = 5 + Math.floor(rand() * 9);
        for (let i = 0; i < n; i++) {
            const y = Math.floor(rand() * H);
            const h = 3 + Math.floor(rand() * 28);
            const shift = Math.floor((rand() - 0.5) * 70);
            try {
                const band = ctx.getImageData(0, y, W, h);
                ctx.putImageData(band, shift, y);
            } catch (e) {}
        }
    };

    // ---- Digital tear / horizontal displacement -------------------------
    // Slice thin bands and nudge them sideways with a subtle RGB split.
    effects.tear = (ctx, W, H) => {
        const slices = 2 + Math.floor(rand() * 5);
        for (let i = 0; i < slices; i++) {
            const y = Math.floor(rand() * H);
            const h = 2 + Math.floor(rand() * 18);
            const shift = Math.floor((rand() - 0.5) * 90);
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(${180 + Math.floor(rand() * 75)},255,255,0.12)`;
            ctx.fillRect(shift, y, W, h);
            ctx.globalCompositeOperation = 'source-over';
        }
    };

    // ---- Buffering ring / -408 style cut --------------------------------
    // Spinning buffering spinner centered on screen.
    effects.buffer = (ctx, W, H, t) => {
        const cx = W / 2, cy = H / 2;
        const r = Math.min(W, H) * 0.16;
        const spin = (t * 0.006) % (Math.PI * 2);
        ctx.save();
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, spin, spin + Math.PI * 1.5);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, spin + Math.PI, spin + Math.PI * 2.5);
        ctx.stroke();
        ctx.restore();
        // small "BUFFERING" tag
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = 'bold 22px "VCR OSD Mono", "VT323", Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('● BUFFERING', cx, cy + r + 26);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
    };

    // ---- Resolution downshift (1080p -> 360p) ---------------------------
    // Downsample the current screen to a tiny canvas, then upscale with
    // nearest-neighbor so it reads as a bandwidth-driven resolution drop.
    effects.downshift = (ctx, W, H) => {
        const rw = 160, rh = 90;
        const off = document.createElement('canvas');
        off.width = rw; off.height = rh;
        const og = off.getContext('2d');
        og.imageSmoothingEnabled = false;
        og.drawImage(ctx.canvas, 0, 0, rw, rh);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(off, 0, 0, W, H);
        ctx.imageSmoothingEnabled = true;
        // block seams + low-res tag
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += rw / 140) {
            ctx.strokeRect(x, 0, 1, H);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = 'bold 20px "VCR OSD Mono", "VT323", Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('LIVE 360P', W / 2, H / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
    };

    // ---- Scheduler ------------------------------------------------------
    // play(kind, frames) arms a glitch; advance(now) steps it per frame and
    // returns false when it has finished. The frame loop calls these.
    function play(kind, frames) {
        window.__CrtTV_glitch = { kind, framesLeft: frames, t0: performance.now() };
    }
    function advance(now) {
        const g = window.__CrtTV_glitch;
        if (!g || g.framesLeft <= 0) return false;
        g.framesLeft--;
        return true;
    }
    function has() { return !!window.__CrtTV_glitch; }

    // Signature durations (in frames at ~60fps) for the direct transition kinds.
    const DUR = { pixelate: 50, datamash: 44, tear: 32, buffer: 75, downshift: 60 };

    window.__Glitches = { effects, DUR, play, advance, has };
})();
