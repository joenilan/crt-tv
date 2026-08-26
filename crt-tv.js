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
        { id: 'peeshaaaa',   name: 'peeshaaaa',   handle: '@peeshaaaa',   media: { type: 'blue' } },
        { id: 'itzdribz',    name: 'itzdribz',    handle: '@itzdribz',    media: null },
        { id: 'bessvibes',   name: 'bessvibes',   handle: '@bessvibes',   media: { type: 'blue' } },
        { id: 'sery_bot',    name: 'sery_bot',    handle: '@sery_bot',    media: { type: 'blue' } },
        { id: 'nightowl',    name: 'nightowl',    handle: '@nightowl',    media: { type: 'blue' } },
        { id: 'retrocat',    name: 'retrocat',    handle: '@retrocat',    media: null },
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
        // Signal-loss: TV off -> blue -> rolling snow -> dead static -> black
        lossStarted: false,
        lossStart: 0,
        black: false,
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
    // The electron beam starts as a thin bright horizontal line at center, then
    // "opens up" vertically into the screen (the classic convergence pop), with
    // a cool-white bloom core that fades to the warm blue glow.
    function drawWarmup(frac) {
        const e = clamp(frac, 0, 1);
        // vertical aperture: thin line -> full height (fast early pop, settle)
        const open = clamp(Math.pow(e, 1.5) * 2.4, 0, 1);
        const halfH = (open * H) / 2;
        const cy = H / 2;
        // cool-white core/bloom: brightest at t=0, gone once warmed
        const core = clamp(1 - e * 2.6, 0, 1);
        const a = clamp(e * 2.0, 0, 1); // overall fill opacity ramp
        // bloom halo behind the opening band (additive)
        if (core > 0.01) {
            ctx.globalCompositeOperation = 'lighter';
            const bloom = ctx.createLinearGradient(0, cy - halfH - 18, 0, cy + halfH + 18);
            bloom.addColorStop(0, 'rgba(120,190,255,0)');
            bloom.addColorStop(0.5, `rgba(190,232,255,${core * 0.55 * a})`);
            bloom.addColorStop(1, 'rgba(120,190,255,0)');
            ctx.fillStyle = bloom;
            ctx.fillRect(0, cy - halfH - 22, W, halfH * 2 + 44);
            ctx.globalCompositeOperation = 'source-over';
        }
        // the filling blue gradient within the opening band
        const g = ctx.createLinearGradient(0, cy - halfH, 0, cy + halfH);
        g.addColorStop(0, `rgba(16,82,158,${a})`);
        g.addColorStop(0.5, `rgba(10,60,122,${a})`);
        g.addColorStop(1, `rgba(6,40,92,${a})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, cy - halfH, W, halfH * 2);
        // bright scanning seam where the beam opens (with slight RGB split)
        const seamY = cy + (rand() - 0.5) * 2;
        ctx.fillStyle = `rgba(180,220,255,${core * 0.9 * a})`;
        ctx.fillRect(-2, seamY - 2, W + 4, 4);
        ctx.fillStyle = `rgba(255,255,255,${core * 0.8 * a})`;
        ctx.fillRect(0, seamY - 0.5, W, 1);
    }

    // ---- Signal-loss sequence renderers ----------------------------------
    // The classic analog "no signal" ramp: solid blue -> rolling snow band
    // -> full dead static -> black (TV off).
    function drawBlueScreen() {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0d6bd8');
        g.addColorStop(1, '#083a78');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(0, H * 0.5, W, 1);
    }

    function drawRollingSnow(elapsed) {
        const roll = (elapsed * 0.15) % (H + 140);
        const rg = ctx.createLinearGradient(0, roll - 70, 0, roll + 70);
        rg.addColorStop(0, 'rgba(0,0,0,0)');
        rg.addColorStop(0.5, 'rgba(140,180,220,0.40)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, roll - 70, W, 140);
        for (let i = 0; i < 160; i++) {
            ctx.fillStyle = rand() > 0.5 ? '#fff' : '#000';
            ctx.fillRect(rand() * W, roll + (rand() - 0.5) * 140, 2, 2);
        }
    }

    function drawDeadStatic(amount) {
        ctx.globalAlpha = amount;
        for (let i = 0; i < 2600; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
            ctx.fillRect(rand() * W, rand() * H, 2, 2);
        }
        ctx.globalAlpha = 1;
    }

    // ---- Static / tracking gap -------------------------------------------
    function drawStatic(amount) {
        ctx.globalAlpha = amount;
        for (let i = 0; i < 300 * amount; i++) {
            const x = rand() * W, y = rand() * H;
            ctx.fillStyle = rand() > 0.5 ? '#fff' : '#000';
            ctx.fillRect(x, y, 2, 2);
        }
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

        // ---- Signal-loss sequence: TV off -> blue -> rolling snow -> dead static
        if (STATE.lossStarted) {
            const elapsed = performance.now() - STATE.lossStart;
            const BLUE_MS = 850, ROLL_MS = 1000, STATIC_MS = 950;
            if (elapsed < BLUE_MS) {
                drawBlueScreen();
                drawScanlines();
            } else if (elapsed < BLUE_MS + ROLL_MS) {
                drawBlueScreen();
                drawRollingSnow(elapsed - BLUE_MS);
                drawScanlines();
            } else if (elapsed < BLUE_MS + ROLL_MS + STATIC_MS) {
                drawRollingSnow(elapsed - BLUE_MS - ROLL_MS);
                drawDeadStatic((elapsed - BLUE_MS - ROLL_MS) / STATIC_MS);
                drawScanlines();
            } else if (!STATE.black) {
                drawDeadStatic(1);
                drawScanlines();
            } else {
                STATE.black = true; // TV off; loop stops
            }
            return;
        }

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

        // ---- Modern-era glitch overlay ---------------------------------
        // A scheduled glitch (see glitches.js) overrides the screen for a few
        // frames — pixelation, datamosh, digital tear, buffering ring, etc.
        if (window.__Glitches && window.__Glitches.has()) {
            const g = window.__CrtTV_glitch;
            const eff = window.__Glitches.effects[g.kind];
            if (eff) eff(ctx, W, H, performance.now() - g.t0);
            drawScanlines();
            if (!window.__Glitches.advance(performance.now())) window.__CrtTV_glitch = null;
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

        // real VHS tracking band: snow that rolls with a gentle wobble and,
        // on drag, snaps back to the wheel center like a physical VCR capstan.
        const bandY = (0.5 + locked) * H;
        const bandHeight = clamp(90 + Math.abs(locked) * 160, 90, 250);
        const rollJitter = (rand() - 0.5) * (16 + Math.abs(locked) * 40);
        const rg = ctx.createLinearGradient(0, bandY - bandHeight, 0, bandY + bandHeight);
        rg.addColorStop(0, 'rgba(0,0,0,0)');
        rg.addColorStop(0.35, `rgba(130,170,210,${0.10 + Math.abs(locked) * 0.28})`);
        rg.addColorStop(0.5, `rgba(170,200,240,${0.20 + Math.abs(locked) * 0.45})`);
        rg.addColorStop(0.65, `rgba(130,170,210,${0.10 + Math.abs(locked) * 0.28})`);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, bandY + rollJitter - bandHeight, W, bandHeight * 2);
        for (let i = 0; i < 120 + Math.abs(locked) * 300; i++) {
            const sy = bandY + (rand() - 0.5) * bandHeight + rollJitter;
            const sx = rand() * W;
            ctx.fillStyle = rand() > 0.5 ? '#fff' : '#000';
            ctx.fillRect(sx, sy, 2, 2);
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
        // Signal-loss: TV off -> blue -> rolling snow -> dead static (scene change).
        // OBS browser-source JS trigger: CrtTV.transition('signalLoss')
        //
        // Modern-era glitches (see glitches.js):
        //   CrtTV.transition('glitch')   // randomized block-pop + datamosh + digital tear burst
        //   CrtTV.transition('buffer')   // buffering ring / -408 style cut
        //   CrtTV.transition('downshift')// 1080p -> 360p bandwidth drop
        //   CrtTV.transition('pixelate'|'datamash'|'tear')  // single effect
        // OBS browser-source JS trigger: CrtTV.transition('glitch')
        transition(kind) {
            if (kind === 'turnOn') {
                STATE.lossStarted = false;
                STATE.black = false;
                STATE.bootStarted = false; // re-arm the boot sequence
                tone(500, 0.15);           // power-on click
            } else if (kind === 'signalLoss') {
                STATE.bootStarted = false;
                STATE.lossStarted = true;
                STATE.lossStart = performance.now();
                STATE.black = false;
                tone(200, 0.2);            // signal-drop thud
            } else if (kind === 'glitch' && window.__Glitches) {
                // randomized modern-era burst: block-pop -> datamosh -> digital tear
                const parts = [
                    ['pixelate', window.__Glitches.DUR.pixelate],
                    ['datamash', window.__Glitches.DUR.datamash],
                    ['tear', window.__Glitches.DUR.tear],
                    ['pixelate', Math.round(window.__Glitches.DUR.pixelate / 2)],
                ];
                let i = 0;
                const step = () => {
                    if (i >= parts.length) return;
                    const [k, f] = parts[i++];
                    window.__Glitches.play(k, f);
                    setTimeout(step, f * 16 + 16);
                };
                step();
            } else if (window.__Glitches && kind in window.__Glitches.effects) {
                // direct single glitch kinds
                window.__Glitches.play(kind, window.__Glitches.DUR[kind]);
            }
            return { lossStarted: STATE.lossStarted, black: STATE.black };
        },
    };
})();
