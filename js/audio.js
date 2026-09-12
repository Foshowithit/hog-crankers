/*
 * HOG CRANKERS - audio.js
 * Fully synthesized WebAudio rig: biker engine, crank music layers, payoffs,
 * pack howls, stingers. Zero external assets, zero network, zero base64.
 * Plain script (ES2019), no modules. Attaches exactly ONE global: window.HogAudio.
 *
 * Design notes:
 * - Lazy AudioContext: HogAudio.init() from a user-gesture handler; resumes if suspended.
 * - Every public method is a safe no-op before init() and safe at 60fps
 *   (per-frame work = param smoothing only; sequenced parts use a 25ms lookahead
 *   setInterval scheduler on the audio clock).
 * - Click/pop safety: every gain gets a short attack/release envelope.
 * - Persistent voices (engine, lead, noise taps) are built once and reused;
 *   transient one-shots are bounded by a live-voice counter.
 */
(function () {
  'use strict';

  var AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);

  var HogAudio = {};

  // ------------------------------------------------------------------ state
  var ctx = null;
  var busIn = null;        // everything feeds this
  var comp = null;         // master compressor
  var masterGain = null;   // mute gain, last before destination
  var muted = false;
  var MASTER_LEVEL = 0.9;

  var noiseBuf = null;     // shared white-noise buffer
  var distCurve = null;    // shared waveshaper curve (built once)

  var liveVoices = 0;      // rough count of transient one-shot voices
  var VOICE_CAP = 40;      // hard ceiling; non-essential hits get dropped past it

  var drive = { speed: 0, rpm: 0 };
  var crank = { active: false, level: 0, hold: 0, riser: 0 };

  var eng = {
    on: false, desired: false, curF: 30,
    saw: null, sub: null, shaper: null, sawG: null, subG: null,
    nSrc: null, nFilt: null, nG: null,
    tone: null, lopeG: null, lopeOsc: null, lopeDepth: null, amp: null
  };

  var taps = {};           // shared persistent noise filters: hat, snare, cym, pop

  var music = null;        // music bus + layer gains + persistent lead voice

  // ------------------------------------------------------------------ utils
  function num(v, d) {
    v = (typeof v === 'number') ? v : parseFloat(v);
    if (v !== v || v === Infinity || v === -Infinity) return d; // NaN / Inf guard
    return v;
  }
  function clamp01(v) { var x = num(v, 0); return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function voiceUp() { liveVoices++; }
  function voiceDown() { liveVoices = liveVoices > 0 ? liveVoices - 1 : 0; }

  // auto-disconnect transient gain when its source oscillator ends (keeps graph clean)
  function bindVoiceEnd(osc, g) {
    voiceUp();
    osc.onended = function () { try { g.disconnect(); } catch (e) {} voiceDown(); };
  }

  function makeNoiseBuffer(sec) {
    var len = Math.floor(ctx.sampleRate * sec);
    var b = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // soft-clip tanh-ish curve, built once, shared by every waveshaper
  function makeDistCurve(k) {
    var n = 1024;
    var c = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      c[i] = (1 + k) * x / (1 + k * Math.abs(x));
    }
    return c;
  }

  // ------------------------------------------------------------------ init
  HogAudio.init = function () {
    if (ctx) {
      if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
      return true;
    }
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { ctx = null; return false; }

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.16;

    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : MASTER_LEVEL;

    busIn = ctx.createGain();
    busIn.gain.value = 1;
    busIn.connect(comp);
    comp.connect(masterGain);
    masterGain.connect(ctx.destination);

    noiseBuf = makeNoiseBuffer(1.7);
    distCurve = makeDistCurve(24);

    buildEngine();
    buildNoiseTaps();
    buildMusic();
    buildWind();

    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
    if (eng.desired) engineStart();
    return true;
  };

  // ------------------------------------------------------------------ mute
  HogAudio.setMute = function (m) {
    muted = (m === true || m === 1 || m === 'true');
    if (ctx && masterGain) {
      masterGain.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, ctx.currentTime, 0.015);
    }
    return muted;
  };

  HogAudio.toggleMute = function () {
    return HogAudio.setMute(!muted);
  };

  // ------------------------------------------------------------------ engine
  // Persistent voice: distorted saw + sub sine + filtered noise, continuous.
  // Idle lope = slow AM on a gain stage; character maps from rpm01 / speed01.
  function buildEngine() {
    eng.shaper = ctx.createWaveShaper();
    eng.shaper.curve = distCurve;
    eng.shaper.oversample = '2x';

    eng.saw = ctx.createOscillator();
    eng.saw.type = 'sawtooth';
    eng.saw.frequency.value = 30;

    eng.sub = ctx.createOscillator();
    eng.sub.type = 'sine';
    eng.sub.frequency.value = 15;

    eng.sawG = ctx.createGain(); eng.sawG.gain.value = 0.5;
    eng.subG = ctx.createGain(); eng.subG.gain.value = 0.42;

    eng.nSrc = ctx.createBufferSource();
    eng.nSrc.buffer = noiseBuf;
    eng.nSrc.loop = true;
    eng.nFilt = ctx.createBiquadFilter();
    eng.nFilt.type = 'bandpass';
    eng.nFilt.frequency.value = 500;
    eng.nFilt.Q.value = 0.7;
    eng.nG = ctx.createGain(); eng.nG.gain.value = 0.03;

    eng.tone = ctx.createBiquadFilter();
    eng.tone.type = 'lowpass';
    eng.tone.frequency.value = 400;
    eng.tone.Q.value = 1.1;

    eng.lopeG = ctx.createGain(); eng.lopeG.gain.value = 0.8;   // AM stage
    eng.lopeOsc = ctx.createOscillator();
    eng.lopeOsc.type = 'sine';
    eng.lopeOsc.frequency.value = 3.5;
    eng.lopeDepth = ctx.createGain(); eng.lopeDepth.gain.value = 0.2;

    eng.amp = ctx.createGain(); eng.amp.gain.value = 0;         // engine on/off

    eng.saw.connect(eng.shaper);
    eng.shaper.connect(eng.sawG);
    eng.nSrc.connect(eng.nFilt);
    eng.nFilt.connect(eng.nG);
    eng.sawG.connect(eng.tone);
    eng.sub.connect(eng.subG);
    eng.subG.connect(eng.tone);
    eng.nG.connect(eng.tone);
    eng.tone.connect(eng.lopeG);
    eng.lopeG.connect(eng.amp);
    eng.amp.connect(busIn);
    eng.lopeOsc.connect(eng.lopeDepth);
    eng.lopeDepth.connect(eng.lopeG.gain);

    eng.saw.start();
    eng.sub.start();
    eng.nSrc.start();
    eng.lopeOsc.start();
  }

  // Persistent wind bed: looping noise → gusty lowpass → speed-driven gain.
  var wind = { src: null, filt: null, amp: null };
  function buildWind() {
    wind.src = ctx.createBufferSource();
    wind.src.buffer = noiseBuf;
    wind.src.loop = true;
    wind.filt = ctx.createBiquadFilter();
    wind.filt.type = 'lowpass';
    wind.filt.frequency.value = 700;
    wind.filt.Q.value = 0.5;
    wind.amp = ctx.createGain();
    wind.amp.gain.value = 0;
    var gust = ctx.createOscillator();
    gust.type = 'sine';
    gust.frequency.value = 0.13;                 // slow gust sweep
    var gustDepth = ctx.createGain();
    gustDepth.gain.value = 320;
    gust.connect(gustDepth);
    gustDepth.connect(wind.filt.frequency);
    wind.src.connect(wind.filt);
    wind.filt.connect(wind.amp);
    wind.amp.connect(busIn);
    wind.src.start();
    gust.start();
  }
  function applyWind(tau) {
    var t = ctx.currentTime;
    var spd = clamp01(drive.speed);
    wind.amp.gain.setTargetAtTime(
      Math.pow(spd, 1.4) * 0.16 + (crank.boostT > 0 ? 0.04 : 0), t, tau);
    wind.filt.frequency.setTargetAtTime(450 + spd * 900, t, tau);
  }

  function applyEngine(tau) {
    if (!ctx) return;
    var t = ctx.currentTime;
    var rpm = clamp01(drive.rpm);
    var spd = clamp01(drive.speed);
    var boost = crank.active ? 1 + clamp01(crank.level) * 1.15 : 1;
    var f = (30 + rpm * 92) * boost; // idle ~30Hz fundamental up to ~260Hz screaming
    eng.curF = f;
    eng.saw.frequency.setTargetAtTime(f, t, tau);
    eng.sub.frequency.setTargetAtTime(f * 0.5, t, tau);
    eng.lopeOsc.frequency.setTargetAtTime(3.2 + rpm * 9, t, tau);
    eng.lopeDepth.gain.setTargetAtTime(0.2 * Math.max(0.15, 1 - rpm * 0.85), t, tau);
    eng.tone.frequency.setTargetAtTime(
      320 + spd * 2400 + rpm * 900 + (crank.active ? clamp01(crank.level) * 1200 : 0), t, tau);
    eng.nG.gain.setTargetAtTime(0.025 + spd * 0.11 + rpm * 0.04, t, tau);
    eng.nFilt.frequency.setTargetAtTime(400 + spd * 1800 + rpm * 500, t, tau);
  }

  function engineStart() {
    if (!ctx || eng.on) return;
    eng.on = true;
    eng.amp.gain.cancelScheduledValues(ctx.currentTime);
    eng.amp.gain.setTargetAtTime(0.5, ctx.currentTime, 0.09); // soft attack
    applyEngine(0.08);
  }

  HogAudio.engineOn = function () {
    eng.desired = true;
    if (!ctx) return;
    engineStart();
  };

  HogAudio.engineOff = function () {
    eng.desired = false;
    if (!ctx || !eng.on) return;
    eng.on = false;
    eng.amp.gain.cancelScheduledValues(ctx.currentTime);
    eng.amp.gain.setTargetAtTime(0, ctx.currentTime, 0.13); // soft release
  };

  // per-frame; param smoothing only, zero node allocation
  HogAudio.setDrive = function (speed01, rpm01) {
    drive.speed = clamp01(speed01);
    drive.rpm = clamp01(rpm01);
    if (!ctx) return;
    if (wind.amp) applyWind(0.08);
    if (!eng.on) return;
    applyEngine(0.06);
  };

  // ------------------------------------------------------------------ noise taps
  // One looping noise source split through persistent filters; each hit only
  // allocates a buffer-source + envelope gain (auto-cleaned on ended).
  function buildNoiseTaps() {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    var split = ctx.createGain();
    split.gain.value = 1;
    src.connect(split);
    function tap(type, freq, q) {
      var f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      split.connect(f);
      return f;
    }
    taps.hat = tap('highpass', 7200, 0.8);
    taps.snare = tap('bandpass', 1900, 0.9);
    taps.cym = tap('highpass', 5200, 0.7);
    taps.pop = tap('bandpass', 400, 2.5);
    src.start();
  }

  function tapHit(filter, t, dur, peak, dest) {
    if (liveVoices > VOICE_CAP) return;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = rnd(0.85, 1.15);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0015, peak), t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0008, t + Math.max(0.012, dur));
    src.connect(filter);
    filter.connect(g);
    g.connect(dest || busIn);
    src.start(t, rnd(0, 1.2));
    src.stop(t + dur + 0.05);
    bindVoiceEnd(src, g);
  }

  // ------------------------------------------------------------------ music rig
  function buildMusic() {
    music = {};
    music.gain = ctx.createGain();
    music.gain.gain.value = 0;
    music.gain.connect(busIn);

    music.drum = ctx.createGain();
    music.drum.gain.value = 0.9;
    music.drum.connect(music.gain);

    // rhythm guitar layer: shared distortion -> own tone -> layer gain
    music.ostShaper = ctx.createWaveShaper();
    music.ostShaper.curve = distCurve;
    music.ostShaper.oversample = '2x';
    music.ostTone = ctx.createBiquadFilter();
    music.ostTone.type = 'lowpass';
    music.ostTone.frequency.value = 1200;
    music.ostTone.Q.value = 0.8;
    music.ost = ctx.createGain();
    music.ost.gain.value = 0;
    music.ostShaper.connect(music.ostTone);
    music.ostTone.connect(music.ost);
    music.ost.connect(music.gain);

    // second guitar layer: octave up, brighter
    music.g2Shaper = ctx.createWaveShaper();
    music.g2Shaper.curve = distCurve;
    music.g2Shaper.oversample = '2x';
    music.g2Tone = ctx.createBiquadFilter();
    music.g2Tone.type = 'lowpass';
    music.g2Tone.frequency.value = 2600;
    music.g2Tone.Q.value = 0.7;
    music.g2 = ctx.createGain();
    music.g2.gain.value = 0;
    music.g2Shaper.connect(music.g2Tone);
    music.g2Tone.connect(music.g2);
    music.g2.connect(music.gain);

    // persistent lead wail voice (two detuned saws + vibrato through bandpass)
    music.leadBP = ctx.createBiquadFilter();
    music.leadBP.type = 'bandpass';
    music.leadBP.frequency.value = 1300;
    music.leadBP.Q.value = 1.1;
    music.lead = ctx.createGain();
    music.lead.gain.value = 0;
    music.leadBP.connect(music.lead);
    music.lead.connect(music.gain);

    music.leadO1 = ctx.createOscillator();
    music.leadO1.type = 'sawtooth';
    music.leadO1.frequency.value = 392;
    music.leadO2 = ctx.createOscillator();
    music.leadO2.type = 'sawtooth';
    music.leadO2.frequency.value = 392;
    music.leadO2.detune.value = 11;
    music.leadO1.connect(music.leadBP);
    music.leadO2.connect(music.leadBP);

    music.leadLFO = ctx.createOscillator();
    music.leadLFO.type = 'sine';
    music.leadLFO.frequency.value = 5.2;
    music.leadLFOG = ctx.createGain();
    music.leadLFOG.gain.value = 7;
    music.leadLFO.connect(music.leadLFOG);
    music.leadLFOG.connect(music.leadO1.frequency);
    music.leadLFOG.connect(music.leadO2.frequency);

    music.leadO1.start();
    music.leadO2.start();
    music.leadLFO.start();
  }

  // distorted power-chord stab (root + fifth + octave, slight detune)
  function chordStab(shaper, tone, t, root, dur, level, toneHz) {
    if (liveVoices > VOICE_CAP) return;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.002, level), t + 0.006);
    g.gain.setValueAtTime(Math.max(0.002, level), t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    var det = crank.riser * 45; // subtle riser pitch as the crank holds
    var f = [root, root * 1.4983, root * 2.0039];
    for (var i = 0; i < f.length; i++) {
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f[i];
      o.detune.value = (i - 1) * 6 + det + rnd(-3, 3);
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.04);
      bindVoiceEnd(o, g);
    }
    g.connect(shaper);
    if (tone) {
      tone.frequency.cancelScheduledValues(t);
      tone.frequency.setValueAtTime(Math.max(300, toneHz), t);
      tone.frequency.exponentialRampToValueAtTime(Math.max(220, toneHz * 0.45), t + dur);
    }
  }

  // ------------------------------------------------------------------ scheduler
  var BPM = 132;
  var STEP = 60 / BPM / 4;      // 16th notes
  var sched = { timer: null, next: 0, step: 0 };
  var ROOT = 110;               // A2
  // gallop ostinato: semitone offset per step, -1 = rest
  var OST = [0, -1, 0, 7, -1, 0, 0, 7, 0, -1, 0, 10, -1, 0, 7, -1];

  function startSched() {
    if (!ctx || sched.timer) return;
    sched.next = ctx.currentTime + 0.08;
    sched.step = 0;
    sched.timer = setInterval(schedTick, 25); // 25ms lookahead scheduler
  }

  function stopSched() {
    if (sched.timer) {
      clearInterval(sched.timer);
      sched.timer = null;
    }
  }

  function schedTick() {
    if (!ctx) { stopSched(); return; }
    var horizon = ctx.currentTime + 0.13;
    var guard = 0;
    while (sched.next < horizon && guard++ < 32) {
      scheduleStep(sched.step, sched.next);
      sched.next += STEP;
      sched.step = (sched.step + 1) % 16;
    }
  }

  // layers arm off live crank level: kick always; distorted ostinato >=0.3;
  // octave guitar + hats >=0.6; hats double-time + extra kick >0.85 (lead is a
  // persistent voice mixed by crankLevel)
  function scheduleStep(s, t) {
    var l = clamp01(crank.level);

    if (s === 0 || s === 6 || s === 8 || s === 14) kick(t, music.drum);
    if (l > 0.6 && s === 11) kick(t, music.drum);
    if (l >= 0.3 && (s === 4 || s === 12)) tapHit(taps.snare, t, 0.16, 0.34, music.drum);

    if (l >= 0.6) {
      if (l > 0.85) {
        tapHit(taps.hat, t, 0.045, 0.12 + 0.08 * l, music.drum); // double-time 16ths
      } else if (s % 2 === 0) {
        tapHit(taps.hat, t, 0.05, 0.14, music.drum);             // 8ths
      }
    }

    if (l >= 0.3) {
      var off = OST[s];
      if (off >= 0) {
        var root = ROOT * Math.pow(2, off / 12);
        chordStab(music.ostShaper, music.ostTone, t, root,
          0.13 + (l > 0.85 ? 0.02 : 0), 0.34 + 0.2 * l, 1400 + 2600 * l);
      }
    }
    if (l >= 0.6 && (s === 2 || s === 10 || s === 14)) {
      var off2 = OST[s];
      var root2 = ROOT * 2 * Math.pow(2, off2 / 12);
      chordStab(music.g2Shaper, music.g2Tone, t, root2, 0.16, 0.2 + 0.12 * l, 2600 + 2200 * l);
    }
  }

  function kick(t, out) {
    if (liveVoices > VOICE_CAP) return;
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(155, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.1);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.85, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.2);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.24);
    bindVoiceEnd(o, g);
    tapHit(taps.snare, t, 0.02, 0.25, out); // click transient
  }

  // ------------------------------------------------------------------ crank flow
  HogAudio.crankBegin = function () {
    if (!ctx) return;
    crank.active = true;
    crank.level = 0;
    crank.hold = 0;
    crank.riser = 0;
    if (eng.on) {
      eng.amp.gain.setTargetAtTime(0.55, ctx.currentTime, 0.05); // engine climbs
    }
    applyEngine(0.06);
    startSched(); // rhythm section armed; mix scales via crankLevel
  };

  // per-frame while cranking; param smoothing only
  HogAudio.crankLevel = function (l01, tSec) {
    if (!ctx || !crank.active) return;
    var l = clamp01(l01);
    var th = Math.max(0, num(tSec, 0));
    crank.level = l;
    crank.hold = th;
    crank.riser = Math.min(1, th / 14);
    var t = ctx.currentTime;

    music.gain.gain.setTargetAtTime(0.42 + 0.58 * l, t, 0.12);
    music.drum.gain.setTargetAtTime(0.8 + 0.3 * l, t, 0.2);
    music.ost.gain.setTargetAtTime(l >= 0.3 ? 0.55 + 0.35 * l : 0.0001, t, 0.15);
    music.g2.gain.setTargetAtTime(l >= 0.6 ? 0.4 : 0.0001, t, 0.18);
    music.lead.gain.setTargetAtTime(l > 0.85 ? 0.07 + ((l - 0.85) / 0.15) * 0.12 : 0.0001, t, 0.12);

    var base = 392 * Math.pow(2, crank.riser); // lead wails, subtle rise up to +1 semi
    music.leadO1.frequency.setTargetAtTime(base, t, 0.12);
    music.leadO2.frequency.setTargetAtTime(base * 1.005, t, 0.12);

    applyEngine(0.09); // engine pitch tracks the crank
  };

  function resetMusic(t) {
    if (!music) return;
    music.gain.gain.cancelScheduledValues(t);
    music.gain.gain.setTargetAtTime(0.0001, t, 0.06);
    music.ost.gain.setTargetAtTime(0.0001, t, 0.06);
    music.g2.gain.setTargetAtTime(0.0001, t, 0.06);
    music.lead.gain.setTargetAtTime(0.0001, t, 0.06);
  }

  HogAudio.crankRelease = function (quality) {
    if (!ctx) return;
    crank.active = false;
    stopSched();
    var t = ctx.currentTime;
    resetMusic(t);
    crank.level = 0;
    crank.riser = 0;
    if (eng.on) applyEngine(0.2);

    var q = quality === 'perfect' ? 'perfect' : (quality === 'late' ? 'late' : 'good');
    if (q === 'perfect') {
      slamChord(t + 0.02, true);
      cymSwell(t + 0.02);
      howlAt(0.85, 0.4); // crowd roar
    } else if (q === 'good') {
      slamChord(t + 0.02, false);
    } else {
      sputter(t + 0.02);
    }
  };

  // full-band sustained power chord slam with pitch rise (~2.5s when big)
  function slamChord(t, big) {
    if (liveVoices > VOICE_CAP + 8) return;
    var roots = big ? [55, 82.41, 110, 164.81, 220, 329.63] : [55, 82.41, 110, 220];
    var peak = big ? 0.5 : 0.26;
    var hold = big ? 1.5 : 0.5;
    var rel = big ? 0.9 : 0.35;

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    g.gain.setValueAtTime(peak, t + hold);
    g.gain.exponentialRampToValueAtTime(0.0008, t + hold + rel);

    var sh = ctx.createWaveShaper();
    sh.curve = distCurve;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.exponentialRampToValueAtTime(big ? 4200 : 2600, t + 0.28);
    lp.frequency.exponentialRampToValueAtTime(900, t + hold + rel);

    g.connect(sh);
    sh.connect(lp);
    lp.connect(busIn);

    for (var i = 0; i < roots.length; i++) {
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = roots[i];
      o.detune.setValueAtTime(rnd(-9, 9), t);
      o.detune.linearRampToValueAtTime(rnd(40, 80), t + 0.5); // pitch rise
      o.connect(g);
      o.start(t);
      o.stop(t + hold + rel + 0.1);
      bindVoiceEnd(o, g);
    }
  }

  function cymSwell(t) {
    if (liveVoices > VOICE_CAP + 8) return;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.45);      // swell
    g.gain.exponentialRampToValueAtTime(0.0008, t + 2.3);    // wash out
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.connect(taps.cym);
    taps.cym.connect(g);
    g.connect(busIn);
    src.start(t, 0);
    src.stop(t + 2.4);
    bindVoiceEnd(src, g);
  }

  function sputter(t) {
    if (liveVoices > VOICE_CAP + 8) return;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.02, t + 0.09);   // stutter bumps
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.14);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.42);
    var sh = ctx.createWaveShaper();
    sh.curve = distCurve;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    g.connect(sh);
    sh.connect(lp);
    lp.connect(busIn);
    var f = [55, 82.41];
    for (var i = 0; i < f.length; i++) {
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f[i], t);
      o.frequency.setTargetAtTime(f[i] * 0.82, t + 0.05, 0.15); // sagging pitch
      o.connect(g);
      o.start(t);
      o.stop(t + 0.5);
      bindVoiceEnd(o, g);
    }
  }

  // OVERCRANK blow-up: rev stutter -> backfire pops -> dies to silence (~1.5s)
  HogAudio.crankOver = function () {
    if (!ctx) return;
    crank.active = false;
    stopSched();
    resetMusic(ctx.currentTime);
    crank.level = 0;
    if (!eng.on) return;
    eng.on = false;
    eng.desired = false;

    var t = ctx.currentTime;
    var f0 = eng.curF || 80;
    var ft = eng.saw.frequency;
    var at = eng.amp.gain;
    eng.lopeDepth.gain.setTargetAtTime(0.0001, t, 0.02);
    ft.cancelScheduledValues(t);
    at.cancelScheduledValues(t);
    for (var i = 0; i < 7; i++) {
      var tt = t + i * 0.065;
      ft.setValueAtTime(i % 2 ? f0 * 0.55 : f0 * 1.6, tt);
      at.setValueAtTime(i % 2 ? 0.18 : 0.5, tt);
    }

    var pt = t + 0.48;
    for (var p = 0; p < 4; p++) {
      if (p === 2 && Math.random() < 0.4) continue; // irregular pops
      backfire(pt + p * rnd(0.14, 0.22));
    }

    at.setValueAtTime(0.35, t + 0.9);
    at.setTargetAtTime(0.0001, t + 0.95, 0.16); // dies to silence
    ft.setTargetAtTime(22, t + 0.9, 0.2);
  };

  function backfire(t) {
    taps.pop.frequency.cancelScheduledValues(t);
    taps.pop.frequency.setValueAtTime(rnd(140, 850), t);
    tapHit(taps.pop, t, 0.09, 0.5, busIn);
  }

  // ------------------------------------------------------------------ howl
  // "AROOOO" pack howl: 6-10 detuned saw voices, glide DOWN then slightly up,
  // bandpass formant sweep (open "AAH" -> closed "OOO"), staggered starts.
  function howlAt(inten, delay) {
    if (!ctx) return;
    inten = clamp01(inten);
    var n = 6 + Math.floor(inten * 4.5); // 6..10
    n = Math.min(n, 10, Math.max(0, VOICE_CAP + 8 - liveVoices));
    if (n <= 0) return;
    var t0 = ctx.currentTime + Math.max(0.01, num(delay, 0.02));
    var dur = 1.2 + inten * 0.8; // 1.2s..2.0s scaled by intensity
    for (var i = 0; i < n; i++) {
      howlVoice(t0 + i * (0.4 / n) + rnd(0, 0.06), dur * rnd(0.85, 1.18), inten);
    }
  }

  function howlVoice(ts, d, inten) {
    var f0 = 235 * Math.pow(2, rnd(-5, 5) / 12); // spread start pitches
    var o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, ts);
    o.frequency.linearRampToValueAtTime(f0 * 0.58, ts + d * 0.55); // glide down
    o.frequency.linearRampToValueAtTime(f0 * 0.74, ts + d * 0.92); // up slightly

    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = rnd(1.6, 3.2);
    bp.frequency.setValueAtTime(rnd(850, 1200), ts);                  // formant open
    bp.frequency.linearRampToValueAtTime(rnd(520, 680), ts + d * 0.8); // formant close

    var g = ctx.createGain();
    var pk = 0.05 + inten * 0.07;
    g.gain.setValueAtTime(0.0001, ts);
    g.gain.linearRampToValueAtTime(pk, ts + rnd(0.08, 0.16));
    g.gain.setValueAtTime(pk, ts + d * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, ts + d);

    o.connect(bp);
    bp.connect(g);
    g.connect(busIn);

    if (Math.random() < 0.6) { // wobble on some voices, keeps it chorused not alarm-y
      var lfo = ctx.createOscillator();
      lfo.frequency.value = rnd(3.8, 6.5);
      var lg = ctx.createGain();
      lg.gain.value = f0 * 0.016 + 2;
      lfo.connect(lg);
      lg.connect(o.frequency);
      lfo.start(ts);
      lfo.stop(ts + d + 0.05);
    }

    o.start(ts);
    o.stop(ts + d + 0.05);
    bindVoiceEnd(o, g);
  }

  HogAudio.howl = function (intensity01) {
    howlAt(clamp01(intensity01), 0.02);
  };

  // ------------------------------------------------------------------ stingers
  function stab(t, freqs, peak, atk, hold, rel, lpPeak, lpEnd) {
    if (liveVoices > VOICE_CAP + 6) return;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.002, peak), t + atk);
    g.gain.setValueAtTime(Math.max(0.002, peak), t + hold);
    g.gain.exponentialRampToValueAtTime(0.0008, t + hold + rel);
    var sh = ctx.createWaveShaper();
    sh.curve = distCurve;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(lpPeak, t);
    lp.frequency.exponentialRampToValueAtTime(lpEnd, t + hold + rel);
    g.connect(sh);
    sh.connect(lp);
    lp.connect(busIn);
    for (var i = 0; i < freqs.length; i++) {
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freqs[i];
      o.detune.value = (i % 2 ? 7 : -7);
      o.connect(g);
      o.start(t);
      o.stop(t + hold + rel + 0.05);
      bindVoiceEnd(o, g);
    }
  }

  function questHit() {
    var t = ctx.currentTime + 0.01;
    // epic two-note: minor stab -> big power chord
    stab(t, [164.81, 196.0, 329.63], 0.28, 0.008, 0.16, 0.1, 2200, 700);
    stab(t + 0.22, [82.41, 123.47, 164.81, 329.63], 0.4, 0.01, 0.6, 0.45, 2600, 800);
  }

  function deliverHit() {
    var t = ctx.currentTime + 0.01;
    stab(t, [110, 164.81, 220, 329.63, 440], 0.34, 0.01, 0.5, 0.5, 3400, 900);
    howlAt(0.5, 0.2); // short howl at half intensity
  }

  function achieveHit() {
    var t = ctx.currentTime + 0.01;
    stab(t, [440, 659.26, 880], 0.2, 0.006, 0.09, 0.16, 5200, 1800);
    stab(t + 0.1, [440, 659.26, 880, 1318.51], 0.24, 0.006, 0.14, 0.3, 5600, 2000);
  }

  function uiClick() {
    var t = ctx.currentTime;
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(68, t + 0.05);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.075);
    o.connect(g);
    g.connect(busIn);
    o.start(t);
    o.stop(t + 0.09);
    bindVoiceEnd(o, g);
    tapHit(taps.hat, t, 0.02, 0.05, busIn); // tiny thunk texture
  }

  HogAudio.stinger = function (kind) {
    if (!ctx) return;
    var k = (kind == null) ? 'ui' : String(kind);
    if (k === 'quest') questHit();
    else if (k === 'deliver') deliverHit();
    else if (k === 'achievement') achieveHit();
    else uiClick();
  };

  // ------------------------------------------------------------------ tick
  // Sweet-spot sparkle; rate-limited so 60fps calls stay bounded.
  var lastTickAt = 0;
  HogAudio.tick = function (level01) {
    if (!ctx || !crank.active) return;
    var pnow = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (pnow - lastTickAt < 75) return;
    var l = clamp01(level01);
    if (l <= 0.02 || liveVoices > VOICE_CAP) return;
    lastTickAt = pnow;
    var t = ctx.currentTime;
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1250 + l * 1500 + rnd(-60, 60), t); // rises with level
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.02 + 0.035 * l, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.1);
    o.connect(g);
    g.connect(busIn);
    o.start(t);
    o.stop(t + 0.12);
    bindVoiceEnd(o, g);
  };

  // ------------------------------------------------------------------ export
  if (typeof window !== 'undefined') window.HogAudio = HogAudio;
})();
