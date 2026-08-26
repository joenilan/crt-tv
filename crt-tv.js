/* CRT / VCR FRIENDS CHANNELS TV
 * Self-contained OBS browser-source widget.
 *
 * Flip through a list of friends' channels. Each channel is LIVE (has media to
 * play) or OFFLINE (no media -> "Technical Difficulties" color bars). No live
 * detection: offline simply means the channel has no playable media.
 *
 * Channel swap FX: brief white flash + swap beep + ~150ms of dead static so it
 * reads as analog tuning.
 *
 * Interactions:
 *   - CH+ / CH-   : Arrow Up / Down  (flip channels, with FX)
 *   - Grid menu   : Enter            (toggle friend-channel grid)
 *   - Click tile  : select a friend's channel
 *   - Click screen: focus grid if open; otherwise noop
 */

(() => {
    'use strict';

    const canvas = document.getElementById('screen');
    const ctx = canvas.getContext('2d', { alpha: false });

    // Internal render resolution (small canvas drawn large for cheap noise)
    const W = 960, H = 540;
    canvas.width = W; canvas.height = H;

    const flash = document.getElementById('flash');
    const gridEl = document.getElementById('grid');
    const well = document.getElementById('well');

    // ---- Channels --------------------------------------------------------
    // Each channel: { id, name, handle, media }
    //   media = null            -> OFFLINE (Technical Difficulties)
    //   media = { type: 'blue' }-> LIVE, blue broadcast test pattern
    //   media = { type: 'local', src } -> LIVE, local mp4/webm (Phase 5)
    //   media = { type: 'embed', url }  -> LIVE, remote iframe (Phase 5)
    const CHANNELS = [
        { id: 'nightbot',  name: 'NightBot',  handle: '@nightbot',  media: { type: 'blue' } },
        { id: 'friend2',   name: 'friend2',   handle: '@friend2',   media: null },
        { id: 'friend3',   name: 'friend3',   handle: '@friend3',   media: { type: 'blue' } },
        { id: 'friend4',   name: 'friend4',   handle: '@friend4',   media: null },
        { id: 'local:clip', name: 'CLIP_01',  handle: 'local',      media: null },
        { id: 'satellite', name: 'SATELLITE', handle: 'SAT',        media: null },
    ];

    const CH_LABELS = ['03', '07', '13', '22', '42', '66'];
    let channelIndex = 0;

    // ---- State -----------------------------------------------------------
    const STATE = {
        t: 0,
        tracking: 0,
        rollPhase: 0,
        last: performance.now(),
        // Turn-on boot: phosphor warm-up -> analog static -> lock
        bootStarted: false,
        bootStart: 0,
    };

    // ---- Pre-render noise texture ---------------------------------------
    function makeNoise(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        const img = g.createImageData(w, h);
        for (let i = 0; i < img.data.length; i += 4) {
            const v = Math.random() * 255;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
            img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        return c;
    }
    const NOISE = makeNoise(200, 120);

    function rand() { return Math.random(); }
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

    // ---- Audio (swap beep) ----------------------------------------------
    let audioCtx = null;
    function ensureAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
            catch (e) { audioCtx = null; }
        }
        return audioCtx;
    }
    function beep(freq, dur) {
        const ac = ensureAudio();
        if (!ac) return;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.value = 0.08;
        osc.connect(gain); gain.connect(ac.destination);
        const now = ac.currentTime;
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.0, now + dur);
        osc.start(now);
        osc.stop(now + dur);
    }
    // Color-tone for the Technical Difficulties screen (1 kHz, muted).
    function tone(freq, dur) {
        const ac = ensureAudio();
        if (!ac) return;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.value = 0.05;
        osc.connect(gain); gain.connect(ac.destination);
        const now = ac.currentTime;
        gain.gain.setValueAtTime(0.0, now);
        gain.gain.linearRampToValueAtTime(0.05, now + 0.01);
        gain.gain.linearRampToValueAtTime(0.0, now + dur);
        osc.start(now);
        osc.stop(now + dur);
    }

    // ---- Channel-swap FX -------------------------------------------------
    // Each switch is a short analog "tuning": white flash + beep + ~150ms of
    // static on the next frames before the new channel locks in.
    function swapChannel(index) {
        index = clamp(index, 0, CHANNELS.length - 1);
        if (index === channelIndex) return;

        // white flash
        flash.classList.remove('on');
        void flash.offsetWidth;       // reflow to restart animation
        flash.classList.add('on');
        setTimeout(() => flash.classList.remove('on'), 130);

        // swap tone: up for CH+, down for CH-
        const dir = index > channelIndex ? 1 : -1;
        beep(620 + dir * 120, 0.05);

        channelIndex = index;
        STATE.t = 0;
        swapStaticUntil = performance.now() + 150; // gate static gap in loop
        if (CHANNELS[index].media === null) tone(1000, 0.6); // "tune" click on offline
    }
    let swapStaticUntil = 0;

    function goUp() { swapChannel(channelIndex + 1); }
    function goDown() { swapChannel(channelIndex - 1); }

    // ---- Content renderers -----------------------------------------------
    // Blue broadcast test pattern (the "on air" glow)
    function drawBlue() {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0b57a6');
        g.addColorStop(0.5, '#0a3f7d');
        g.addColorStop(1, '#06284f');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // faint moving color bars bottom
        const bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#0000c0', '#c00000'];
        const bw = W / bars.length;
        bars.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * bw, H * 0.78, bw, H * 0.22); });
        // faint snow
        ctx.globalAlpha = 0.05;
        for (let i = 0; i < 40; i++) {
            ctx.fillStyle = rand() > 0.5 ? '#bfe6ff' : '#04121f';
            ctx.fillRect(0, rand() * H, W, 1);
        }
        ctx.globalAlpha = 1;
    }

    // Technical Difficulties: SMPTE-style color bars + brief tone
    function drawColorBars() {
        const bars = ['#c8c8c8', '#c8c800', '#00c8c8', '#00c800', '#c800c8', '#0000c8', '#c80000'];
        const bw = W / bars.length;
        bars.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * bw, 0, bw, H); });
        // black band overlay with text
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, H * 0.30, W, H * 0.16);
        ctx.fillStyle = '#e8e8e8';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 26px "VCR OSD Mono", "VT323", Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('TECHNICAL DIFFICULTIES', W / 2, H * 0.38);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        if (!drawColorBars._tone) { drawColorBars._tone = true; tone(1000, 0.8); }
    }
    drawColorBars._tone = false;

    // ---- Phosphor warm-up (CRT turn-on) ----------------------------------
    // Screen lights up from a faint vertical glow — the classic CRT boot glow.
    function drawWarmup(frac) {
        const e = clamp(frac, 0, 1);
        const grow = Math.min(1, e * 1.7); // expands vertically then fills
        const top = (1 - grow) * H * 0.5;
        const bot = H - (1 - grow) * H * 0.5;
        const g = ctx.createLinearGradient(0, top, 0, bot);
        const a = e * e * 0.92; // ease-in
        g.addColorStop(0, `rgba(24,104,190,${a})`);
        g.addColorStop(0.5, `rgba(12,74,144,${a})`);
        g.addColorStop(1, `rgba(6,40,80,${a})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    // ---- Static / tracking gap -------------------------------------------
    function drawStatic(amount) {
        ctx.globalAlpha = amount;
        for (let i = 0; i < 300 * amount; i++) {
            const x = rand() * W, y = rand() * H;
            ctx.fillStyle = rand() > 0.5 ? '#fff' : '#000';
            ctx.fillRect(x, y, 2, 2);
        }
        // rolling tracking band
        const roll = STATE.rollPhase % (H + 120);
        const rg = ctx.createLinearGradient(0, roll, 0, roll + 90);
        rg.addColorStop(0, 'rgba(0,0,0,0)');
        rg.addColorStop(0.5, 'rgba(120,160,200,0.22)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, roll - 60, W, 90);
        ctx.globalAlpha = 1;
    }

    // ---- Tracking wobble: snow column that follows the drag knob ---------
    // While the tracking knob is dragged the snow band drifts vertically and
    // jitters; on release it snaps back to center via a spring.
    function drawTrackingWobble() {
        const t = STATE.tracking;
        if (Math.abs(t) < 0.001) return;
        const bandY = ((0.5 + t) * H) + (rand() - 0.5) * 10;
        const amt = clamp(Math.abs(t) * 0.85, 0, 0.85);
        ctx.globalAlpha = amt;
        for (let i = 0; i < 240 * Math.abs(t) + 24; i++) {
            const x = rand() * W;
            ctx.fillStyle = rand() > 0.5 ? '#fff' : '#000';
            ctx.fillRect(x, bandY + (rand() - 0.5) * 64, 2, 2);
        }
        ctx.globalAlpha = 1;
    }

    // ---- Scanlines + RGB fringing (always on top of content) ------------
    function drawScanlines() {
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = '#000000';
        for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
        ctx.globalAlpha = 1;

        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = '#3aa6ff'; ctx.fillRect(2, 0, W, H);
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = '#ff5a8a'; ctx.fillRect(-2, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }

    // ---- OSD chrome ------------------------------------------------------
    function drawOSD() {
        const live = CHANNELS[channelIndex].media !== null;
        const c = CHANNELS[channelIndex];

        // channel number
        ctx.textBaseline = 'top';
        ctx.font = 'bold 22px "VCR OSD Mono", "VT323", Consolas, monospace';
        ctx.fillStyle = 'rgba(79,227,255,0.95)';
        ctx.textAlign = 'left';
        ctx.fillText('CH ' + CH_LABELS[channelIndex % CH_LABELS.length], 26, 22);

        // handle / name top-right
        ctx.textAlign = 'right';
        ctx.fillStyle = live ? 'rgba(87,255,143,0.95)' : 'rgba(255,110,110,0.9)';
        ctx.fillText(c.name, W - 26, 20);
        ctx.font = '16px "VCR OSD Mono", "VT323", Consolas, monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(c.handle, W - 26, 46);

        // status dot
        ctx.textAlign = 'left';
        ctx.font = 'bold 18px "VCR OSD Mono", "VT323", Consolas, monospace';
        if (live) {
            ctx.fillStyle = 'rgba(87,255,143,0.95)';
            ctx.fillText('\u25CF LIVE', 26, H - 44);
        } else {
            ctx.fillStyle = 'rgba(255,110,110,0.9)';
            ctx.fillText('\u25CF OFFLINE', 26, H - 44);
        }

        // channel hint
        ctx.textAlign = 'center';
        ctx.font = '14px "VCR OSD Mono", "VT323", Consolas, monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('\u2191 \u2193 tune   \u23CE menu', W / 2, H - 20);
    }

    // ---- Grid menu -------------------------------------------------------
    function buildGrid() {
        gridEl.innerHTML = '';
        CHANNELS.forEach((c, i) => {
            const live = c.media !== null;
            const t = document.createElement('button');
            t.className = 'tile';
            t.type = 'button';
            t.setAttribute('tabindex', '0');
            t.innerHTML =
                '<div class="status ' + (live ? 'live' : 'offline') + '">' +
                    '<span class="dot"></span>' + (live ? 'LIVE' : 'OFFLINE') +
                '</div>' +
                '<div class="name">' + c.name + '</div>' +
                '<div class="handle">' + c.handle + '</div>' +
                '<div class="tag">CH ' + CH_LABELS[i % CH_LABELS.length] + '</div>';
            t.addEventListener('click', () => { swapChannel(i); STATE.gridOpen = false; gridEl.classList.remove('show'); });
            gridEl.appendChild(t);
        });
    }
    function toggleGrid() {
        STATE.gridOpen = !STATE.gridOpen;
        gridEl.classList.toggle('show', STATE.gridOpen);
    }

    // ---- Tracking spring (snap-back to center) ---------------------------
    function applyTracking(dt) {
        const stiffness = 90, damping = 16;
        const force = (0 - STATE.tracking) * stiffness - trackingVel * damping;
        trackingVel += force * dt;
        STATE.tracking += trackingVel * dt;
        if (Math.abs(STATE.tracking) < 0.001 && Math.abs(trackingVel) < 0.001) {
            STATE.tracking = 0;
            trackingVel = 0;
        }
    }

    // ---- Main loop -------------------------------------------------------
    function frame(now) {
        const dt = Math.min((now - STATE.last) / 1000, 0.05);
        STATE.last = now;
        STATE.t += dt;
        STATE.rollPhase += 300 * dt;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        // ---- Turn-on sequence: phosphor warm-up -> analog static -> lock --
        if (!STATE.bootStarted) {
            STATE.bootStart = performance.now();
            STATE.bootStarted = true;
            requestAnimationFrame(frame);
            return;
        }
        const bootElapsed = performance.now() - STATE.bootStart;
        const WARMUP_MS = 950, STATIC_MS = 450;
        if (bootElapsed < WARMUP_MS) {
            drawWarmup(bootElapsed / WARMUP_MS);
            drawScanlines();
            requestAnimationFrame(frame);
            return;
        } else if (bootElapsed < WARMUP_MS + STATIC_MS) {
            drawStatic(1);
            drawScanlines();
            requestAnimationFrame(frame);
            return;
        }

        // ---- Locked: normal channel rendering ------------------------------
        // integrate tracking spring back to center when not dragging
        if (!dragging) applyTracking(dt);
        const locked = STATE.tracking;

        const channel = CHANNELS[channelIndex];
        const live = channel.media !== null;

        if (performance.now() < swapStaticUntil) {
            drawStatic(1);
            drawTrackingWobble();
        } else if (!live) {
            drawColorBars();
        } else if (channel.media.type === 'blue') {
            drawBlue();
        } else {
            // local / embed media handled by injected DOM (see below)
            drawBlue();
        }

        if (Math.abs(locked) > 0.001) drawTrackingWobble();
        drawScanlines();

        drawOSD();

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // ---- Interactivity ---------------------------------------------------
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') { goUp(); e.preventDefault(); }
        else if (e.key === 'ArrowDown') { goDown(); e.preventDefault(); }
        else if (e.key === 'Enter') { toggleGrid(); e.preventDefault(); }
        else if (e.key === 'Escape' && STATE.gridOpen) { toggleGrid(); e.preventDefault(); }
    });

    // first user gesture enables audio
    ['click', 'keydown', 'pointerdown'].forEach(ev =>
        window.addEventListener(ev, () => ensureAudio(), { once: true }));

    // ---- Tracking knob: drag the screen vertically to roll tracking ------
    // While dragging, a snow column/jitter follows the drag; on release the
    // tracking snaps back to center (spring). Fixes the Phase-1 promise of a
    // working tracking drag that was documented but never wired up.
    let dragging = false;
    let trackingTarget = 0;
    let trackingVel = 0;

    well.addEventListener('pointerdown', (e) => {
        dragging = true;
        try { well.setPointerCapture(e.pointerId); } catch (err) {}
    });
    window.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const rect = well.getBoundingClientRect();
        const relY = (e.clientY - rect.top) / rect.height; // 0..1
        trackingTarget = clamp((relY - 0.5) * 2, -1, 1);      // -1..1
        STATE.tracking = trackingTarget; // instant, responsive feel
    });
    window.addEventListener('pointerup', () => {
        if (!dragging) return;
        dragging = false;
        trackingTarget = 0; // snap back: spring pulls tracking toward 0
    });

    // ---- Init ------------------------------------------------------------
    buildGrid();

    // expose a tiny API for OBS JS triggers / future automation
    window.CrtTV = {
        goUp, goDown, toggleGrid, swapChannel,
        // Replays the CRT turn-on: phosphor warm-up -> analog static -> lock.
        // OBS browser-source JS trigger: CrtTV.transition('turnOn')
        transition(kind) {
            if (kind === 'turnOn') {
                STATE.bootStarted = false; // re-arm the boot sequence
                tone(500, 0.15);           // power-on click
            }
        },
    };
})();
