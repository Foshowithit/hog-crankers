/* hog-crankers · js/voicepack.js — WAVE 7: Pack-brother VO as real rendered clips.
 * Kokoro-TTS clips live at assets/voice/<name>.mp3 (37 of them, rendered on the Dell —
 * see game-fleet/music/kokoro-lane/). This wraps window.HogVoice WITHOUT touching
 * voice.js: events with a matching clip play the clip; anything else (dynamic
 * distress strings, missing clip) falls through to the original synth path.
 * Priority semantics preserved: 'high' interrupts the current clip AND cancels any
 * pending synth speech; 'low' refuses while a clip is playing OR the synth is busy
 * (voice.js semantics mirrored). Mute kills clips instantly. Missing file = synth fallback.
 * Loads AFTER voice.js. Adds ONE global: window.HogVoicePack. */
window.HogVoicePack = (function () {
  'use strict';
  var V = window.HogVoice;
  if (!V) return { wrapped: false };

  var CLIP_EVENTS = {
    title: 3, start: 3, deliver: 3, overcrank: 3, respawn: 3,
    attach: 3, crankPerfect: 3, hoa: 3, quest: 3, maxcrank: 3,
    'rankup-gen': 2
  };
  var TIERS = ['STRANGER', 'PROSPECT', 'BROTHER', 'ROAD CAPTAIN', 'ABSOLUTE MFER'];
  var LOW_COOLDOWN = 700;         // mirror voice.js so crankPerfect never machine-guns
  var lastLowAt = 0;

  var pool = {};                  // name -> Audio (built lazily on first gesture)
  var current = null;
  var primed = false;

  function build(name) {
    if (pool[name]) return pool[name];
    try {
      var el = new Audio('assets/voice/' + name + '.mp3');
      el.preload = 'auto';
      el.addEventListener('error', function () { pool[name].broken = true; });
      el.addEventListener('ended', function () {          /* release the low-priority latch */
        if (current && current.el === el) current = null;
      });
      pool[name] = { el: el, broken: false };
      return pool[name];
    } catch (e) { pool[name] = { broken: true }; return pool[name]; }
  }
  function ensurePool() {
    if (primed) return;
    primed = true;
    var n = 0;
    for (var ev in CLIP_EVENTS) for (var i = 0; i < CLIP_EVENTS[ev]; i++) build(ev + '-' + i);
    for (var t = 0; t < TIERS.length; t++) build('rankup-tier-' + t);
  }
  function synthBusy() {
    try { return !!(window.speechSynthesis && (window.speechSynthesis.speaking || window.speechSynthesis.pending)); }
    catch (e) { return false; }
  }
  function synthCancel() {
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
  }
  function play(name, high) {
    var c = build(name);
    if (c.broken) return false;
    if (V.muted) return false;
    if (!high) {
      if (current || synthBusy()) return false;           /* voice.js low semantics: only when idle */
      var now = Date.now();
      if (now - lastLowAt < LOW_COOLDOWN) return false;
      lastLowAt = now;
    } else {
      synthCancel();                                      /* high flushes the synth queue (voice.js invariant) */
    }
    try {
      if (current && current !== c) { try { current.el.pause(); } catch (e) {} current = null; }
      c.el.currentTime = 0;
      var pr = c.el.play();
      if (pr && pr.then) pr.then(function () {}).catch(function () { return false; });
      current = c;
      V._lastLine = 'clip:' + name;
      return true;
    } catch (e) { return false; }
  }

  function pickClip(ev) {
    var n = CLIP_EVENTS[ev];
    if (n) return ev + '-' + ((Math.random() * n) | 0);
    return null;
  }

  function tryEvent(name, detail) {
    detail = detail || {};
    var high = true;
    if (name === 'title' || name === 'crankPerfect') high = false;
    if (name === 'quest') return play(pickClip('quest'), high);
    if (name === 'maxcrank') return play(pickClip('maxcrank'), high);
    if (name === 'rankup') {
      var ti = -1, tier = String(detail.tier || '').toUpperCase();
      for (var t = 0; t < TIERS.length; t++) if (tier === TIERS[t]) ti = t;
      if (ti >= 0) return play('rankup-tier-' + ti, high);
      return play(pickClip('rankup-gen'), high);
    }
    var clip = pickClip(name);
    return clip ? play(clip, high) : false;
  }

  /* ---- wrap the existing HogVoice surface ---- */
  var origEvent = V.event;
  var origSetMuted = V.setMuted;
  V.event = function (name, detail) {
    try { ensurePool(); } catch (e) {}
    try { if (tryEvent(name, detail)) return true; } catch (e) {}
    return origEvent(name, detail);
  };
  V.setMuted = function (m) {
    try {
      if (current) { try { current.el.pause(); } catch (e) {} current = null; }
    } catch (e) {}
    return origSetMuted(m);
  };

  return { wrapped: true, _play: play, _ensurePool: ensurePool };
})();
