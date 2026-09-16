/* hog-crankers · js/stormaudio.js — WAVE 21 "THE STORM HAS A VOICE".
 * Fully procedural storm audio (WebAudio synthesis, ZERO audio assets — MAKE-DONT-BUY):
 *   RAIN    — looping filtered white-noise bed (buffer built once, looped through
 *             bandpass ~2.4kHz + lowshelf body), intensity follows weather.phase
 *             via setTargetAtTime (no zipper noise), slow LFO amplitude undulation.
 *   THUNDER — arrives AFTER the flash, delayed by distance (delay ≈ dist/340 s,
 *             game units ≈ meters), quieter when far (gain ∝ 1/d clamped, crack
 *             dies with distance²). Layered white-crack + brown-rumble burst with
 *             lowpass sweep down (crack → rumble), per-strike random character.
 *   WIND    — separate low-band noise bed (lowpass 120-280Hz), gain follows
 *             window.HogWind gust — audio swells on the SAME ~7s beat the corn
 *             visibly sways to. One clock, sound and sight.
 *
 * Structural conventions mirror js/music.js / js/audio.js: own AudioContext, lazy
 * gesture-gated start (own pointer/touch/key/click listeners — audio can't start
 * before a user gesture), everything exception-safe (missing HogWeather/HogWind/
 * AudioContext ⇒ module stays dormant, zero errors), one global attached.
 * Mute sync is read-only coupling: game.js mirrors its muted flag onto #mutetag
 * (display block = muted) and pause onto #pauseov — both polled; storm audio DUCKS
 * hard while paused. Runs on the touch tier too (tap = gesture).
 * Attaches exactly ONE global: window.HogStormAudio (+ _graph rig-only node handle). */
window.HogStormAudio = (function () {
  var AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);

  var ctx = null, master = null, thunderBus = null;
  var rainLevel = null, windLevel = null;          /* 0..1 API gains (bed loudness) */
  var windLP = null;                               /* gust opens the wind band */
  var whiteBuf = null, brownBuf = null;            /* built once at start */
  var started = false;
  var muted = false, ducked = false, masterWant = 1;
  var lastRainTgt = -1, lastWindTgt = -1, lastWindF = -1;
  var lastThunder = null;
  var hookBX = null, hookBZ = null;                /* last coords handed over by the game hook */
  /* rig-only node handle: filled in-place at start, nodes null before that */
  var graphBox = { ctx: null, master: null, rain: null, wind: null, thunder: null };

  var RAIN_TGT = { calm: 0.0, building: 0.13, storm: 1.0, clearing: 0.32 };
  var RAIN_TAU = 1.2, WIND_TAU = 0.45, DUCK = 0.06;

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function num(v, d) { return (typeof v === 'number' && v === v && isFinite(v)) ? v : d; }

  /* ---- read-only coupling: the game's own ground-truth flags (no game.js edits) ---- */
  function readMuted() {
    try {
      var el = document.getElementById('mutetag');     /* game.js: display block = muted */
      if (el) return el.style.display === 'block';
    } catch (e) {}
    return muted;
  }
  function readDucked() {
    try {
      var el = document.getElementById('pauseov');     /* overlay visible = paused */
      if (el && el.style.display && el.style.display !== 'none') return true;
    } catch (e) {}
    return false;
  }
  function bikePos() {
    try {
      if (window.HogTraffic && window.HogTraffic.state) {
        var s = window.HogTraffic.state();
        return { x: num(s.px, 0), z: num(s.pz, 0) };
      }
    } catch (e) {}
    try {
      if (window.HogWind && window.HogWind.state) {
        var w = window.HogWind.state();
        if (w && w.bike) return { x: num(w.bike[0], 0), z: num(w.bike[1], 0) };
      }
    } catch (e) {}
    return { x: 0, z: 0 };
  }
  function phaseNow() {
    try {
      if (window.HogWeather && window.HogWeather.state) return window.HogWeather.state().phase;
    } catch (e) {}
    return null;
  }
  function gustNow() {
    try {
      if (window.HogWind && window.HogWind.state) return num(window.HogWind.state().gust, 0.1);
    } catch (e) {}
    return 0.1;
  }

  /* ---- graph ---- */
  function makeWhite(sec) {
    var len = Math.max(1, Math.floor(ctx.sampleRate * sec));
    var b = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function makeBrown(sec) {
    var len = Math.max(1, Math.floor(ctx.sampleRate * sec));
    var b = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = b.getChannelData(0), last = 0, peak = 0, i;
    for (i = 0; i < len; i++) {                    /* leaky integrator: white -> brown */
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last;
      var a = last < 0 ? -last : last;
      if (a > peak) peak = a;
    }
    var k = peak > 0 ? 0.8 / peak : 1;
    for (i = 0; i < len; i++) d[i] *= k;
    return b;
  }

  function build() {
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    thunderBus = ctx.createGain();
    thunderBus.gain.value = 1;
    thunderBus.connect(master);

    /* RAIN: white loop -> bandpass (broad 1-4kHz hiss) -> lowshelf (body) -> level
       0..1 -> undulation (slow LFO breath, ±0.15) -> master */
    var rSrc = ctx.createBufferSource();
    rSrc.buffer = whiteBuf; rSrc.loop = true;
    var rBP = ctx.createBiquadFilter();
    rBP.type = 'bandpass'; rBP.frequency.value = 2400; rBP.Q.value = 0.45;
    var rSh = ctx.createBiquadFilter();
    rSh.type = 'lowshelf'; rSh.frequency.value = 400; rSh.gain.value = 3.5;
    rainLevel = ctx.createGain(); rainLevel.gain.value = 0;
    var undul = ctx.createGain(); undul.gain.value = 0.85;
    var lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;   /* ~14s swell */
    var lfoG = ctx.createGain(); lfoG.gain.value = 0.15;
    lfo.connect(lfoG); lfoG.connect(undul.gain);
    rSrc.connect(rBP); rBP.connect(rSh); rSh.connect(rainLevel);
    rainLevel.connect(undul); undul.connect(master);
    rSrc.start(0, 0);
    lfo.start(0);

    /* WIND: second decorrelated white loop -> lowpass 120-280Hz (felt > heard)
       -> level 0..1 -> trim -> master. Gust opens both level and filter. */
    var wSrc = ctx.createBufferSource();
    wSrc.buffer = whiteBuf; wSrc.loop = true;
    windLP = ctx.createBiquadFilter();
    windLP.type = 'lowpass'; windLP.frequency.value = 140; windLP.Q.value = 0.8;
    windLevel = ctx.createGain(); windLevel.gain.value = 0;
    var wTrim = ctx.createGain(); wTrim.gain.value = 0.5;
    wSrc.connect(windLP); windLP.connect(windLevel); windLevel.connect(wTrim);
    wTrim.connect(master);
    wSrc.start(0, 1.7);                            /* offset decorrelates from rain */
    graphBox.ctx = ctx; graphBox.master = master; graphBox.thunder = thunderBus;
    graphBox.rain = rainLevel; graphBox.wind = windLevel;
  }

  function applyMaster(force) {
    var want = muted ? 0 : (ducked ? DUCK : 1);
    if (!force && want === masterWant) return;
    masterWant = want;
    try { master.gain.setTargetAtTime(want, ctx.currentTime, muted ? 0.04 : 0.3); } catch (e) {}
  }

  /* ---- 10Hz housekeeping: mute/pause coupling + phase/gust following. No allocs
     beyond the tiny probe objects the game's own state() getters return. ---- */
  function tick() {
    if (!ctx || !master) return;
    var m = readMuted();
    if (m !== muted) { muted = m; applyMaster(); }
    var dk = readDucked();
    if (dk !== ducked) { ducked = dk; applyMaster(); }
    try {
      var ph = phaseNow();
      var tgt = RAIN_TGT[ph];
      if (tgt === undefined) tgt = 0;
      if (Math.abs(tgt - lastRainTgt) > 0.001) {
        lastRainTgt = tgt;
        rainLevel.gain.setTargetAtTime(tgt, ctx.currentTime, RAIN_TAU);
      }
    } catch (e) {}
    try {
      var g = clamp01((gustNow() - 0.08) / 0.92);  /* calm breeze 0.10 ≈ barely there */
      if (Math.abs(g - lastWindTgt) > 0.004) {
        lastWindTgt = g;
        windLevel.gain.setTargetAtTime(g, ctx.currentTime, WIND_TAU);
      }
      var f = 120 + gustNow() * 160;
      if (Math.abs(f - lastWindF) > 2) {
        lastWindF = f;
        windLP.frequency.setTargetAtTime(f, ctx.currentTime, 0.6);
      }
    } catch (e) {}
  }

  /* ---- THUNDER: layered burst scheduled at t0 = now + dist/340. Crack = bandpassed
     white with downward sweep + fast attack, dies with distance². Rumble = brown
     noise through a low 100-210Hz lowpass, slow attack, 0.8-2.5s decay with wobble. ---- */
  function cleanupNodes(list) {
    return function () {
      for (var i = 0; i < list.length; i++) { try { list[i].disconnect(); } catch (e) {} }
    };
  }
  function playThunder(px, pz) {
    var b = bikePos();
    var dx = px - b.x, dz = pz - b.z;
    var dist = Math.max(8, Math.sqrt(dx * dx + dz * dz));
    var delay = dist / 340;                        /* game units ≈ meters, sound 340 m/s */
    var prox = clamp01(140 / dist);
    if (prox < 0.15) prox = 0.15;
    var t0 = ctx.currentTime + delay;
    /* crack */
    var srcC = ctx.createBufferSource();
    srcC.buffer = whiteBuf;
    srcC.playbackRate.value = 0.9 + Math.random() * 0.25;
    var bpC = ctx.createBiquadFilter();
    bpC.type = 'bandpass'; bpC.Q.value = 0.7;
    bpC.frequency.setValueAtTime(1600 + Math.random() * 1400, t0);
    bpC.frequency.exponentialRampToValueAtTime(280, t0 + 0.9);   /* sweep down: crack -> body */
    var gC = ctx.createGain();
    var lvlC = 0.6 * prox * prox;
    gC.gain.setValueAtTime(0.0001, t0);
    gC.gain.exponentialRampToValueAtTime(Math.max(lvlC, 0.001), t0 + 0.012);
    gC.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.75 + Math.random() * 0.4);
    srcC.connect(bpC); bpC.connect(gC); gC.connect(thunderBus);
    srcC.start(t0, Math.random() * 2); srcC.stop(t0 + 1.5);
    srcC.onended = cleanupNodes([bpC, gC]);
    /* rumble */
    var srcR = ctx.createBufferSource();
    srcR.buffer = brownBuf;
    srcR.playbackRate.value = 0.75 + Math.random() * 0.35;
    var lpR = ctx.createBiquadFilter();
    lpR.type = 'lowpass'; lpR.frequency.value = 100 + Math.random() * 110; lpR.Q.value = 0.9;
    var gR = ctx.createGain();
    var lvlR = 0.95 * prox;
    var atkR = 0.04 + Math.random() * 0.12;
    var tauR = 0.35 + Math.random() * 0.55;
    var holdR = (0.8 + Math.random() * 1.7) * 0.3;
    gR.gain.setValueAtTime(0.0001, t0);
    gR.gain.linearRampToValueAtTime(lvlR, t0 + atkR);
    gR.gain.setTargetAtTime(0.0001, t0 + atkR + holdR, tauR);
    var lfoR = ctx.createOscillator(); lfoR.frequency.value = 2.5 + Math.random() * 3.5;
    var lfoRG = ctx.createGain(); lfoRG.gain.value = lvlR * 0.35;   /* rumble wobble */
    lfoR.connect(lfoRG); lfoRG.connect(gR.gain);
    srcR.connect(lpR); lpR.connect(gR); gR.connect(thunderBus);
    var endT = t0 + atkR + tauR * 5;
    srcR.start(t0, Math.random() * 1.5); srcR.stop(endT);
    lfoR.start(t0); lfoR.stop(endT);
    srcR.onended = cleanupNodes([lpR, gR, lfoRG]);
  }

  /* API: strike(bx, bz[, raw]). Called by the game hook (game.js strikeNow, one line)
     with the storm's last-strike coords; raw=true (rig/probe only) trusts coords as-is.
     Hook coords are fresh when the strike built a visible bolt mesh; otherwise they are
     the previous bolt's — if they repeat or land implausibly far, synthesize a plausible
     near-field position (mirrors buildBolt's own ahead-lateral distribution) so every
     strike gets thunder with believable distance. No-op when the module never started. */
  function strike(bx, bz, raw) {
    if (!ctx || !started) return false;
    bx = num(bx, 0); bz = num(bz, 0);
    var pos;
    if (raw) { pos = { x: bx, z: bz }; }
    else {
      var b = bikePos();
      var d = Math.sqrt((bx - b.x) * (bx - b.x) + (bz - b.z) * (bz - b.z));
      var stale = (hookBX === bx && hookBZ === bz) || d > 300 || d < 8;
      hookBX = bx; hookBZ = bz;
      if (stale) pos = { x: b.x + (Math.random() * 240 - 120), z: b.z + 60 + Math.random() * 100 };
      else pos = { x: bx, z: bz };
    }
    try { playThunder(pos.x, pos.z); } catch (e) { return false; }
    lastThunder = {
      t: +ctx.currentTime.toFixed(3),
      delay: +(Math.max(8, Math.sqrt((pos.x - bikePos().x) * (pos.x - bikePos().x) +
        (pos.z - bikePos().z) * (pos.z - bikePos().z))) / 340).toFixed(4),
      dist: +Math.sqrt((pos.x - bikePos().x) * (pos.x - bikePos().x) +
        (pos.z - bikePos().z) * (pos.z - bikePos().z)).toFixed(1)
    };
    return true;
  }

  function unlock() {
    if (started) return;
    if (!AC) return;                               /* no WebAudio: stay dormant, zero errors */
    if (!ctx) {
      try { ctx = new AC(); } catch (e) { ctx = null; return; }
      if (!ctx) return;
      try {
        whiteBuf = makeWhite(3);
        brownBuf = makeBrown(2.5);
        build();
      } catch (e) { ctx = null; return; }          /* any failure = silence, never an error */
    }
    try { if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); } catch (e) {}
    started = true;
    muted = readMuted();
    ducked = readDucked();
    applyMaster(true);
    if (!stormTick) stormTick = setInterval(tick, 100);
    tick();
  }

  var stormTick = null;
  try {                                            /* gesture listeners: observe only */
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('mousedown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('click', unlock, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (!ctx || !started) return;
      try {                                        /* belt-and-braces: hidden tab ducks */
        if (document.hidden !== ducked) { ducked = !!document.hidden || readDucked(); applyMaster(); }
      } catch (e) {}
    });
  } catch (e) {}

  return {
    state: function () {
      return {
        started: started,
        muted: started ? readMuted() : false,
        rain: started && rainLevel ? +rainLevel.gain.value.toFixed(3) : 0,
        wind: started && windLevel ? +windLevel.gain.value.toFixed(3) : 0,
        lastThunder: lastThunder
      };
    },
    setMuted: function (m) {                       /* API completeness; live sync is #mutetag */
      muted = (m === true || m === 1 || m === 'true');
      if (ctx && master) applyMaster();
      return muted;
    },
    strike: strike,
    /* rig-only handle (same spirit as HogTraffic._cars): attach AnalyserNodes here */
    _graph: graphBox
  };
})();
