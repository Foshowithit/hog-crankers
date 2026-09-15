/* HOG CRANKERS — COUCH MODE (side-lane wave S1, branch sidelane/fauna-couch-v1)
   Gamepad support as a pure add-on: maps a Standard-mapping controller onto the SAME
   synthetic KeyboardEvents touch.js already uses (dispatch on window, code+key, hold =
   one keydown + one keyup) — the game's own key handler and per-frame keys[] object
   never know the difference, so zero game.js edits.
   Mapping: left stick / dpad ←→ = steer (Arrow keys) · RT = throttle (KeyW) ·
   LT = brake (KeyS) · A (hold) = crank (Space) · Start = pause in-ride / start on title
   (Enter) · Y = mute · RB = camera · LB = help. Rumble via vibrationActuator when the
   browser exposes it (Chrome/Edge; Safari does not — guarded): strong on game over,
   double-pulse on rank up, light tick on lightning flash (throttled).
   Desktop only (touch has on-screen pads). Headless-testable: the pad is re-read live
   via navigator.getGamepads() every frame, so a test can monkey-patch it and drive the
   mapping; window.HogCouch.state() exposes connection + held keys + last tap. */
(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : globalThis;
  var IS_TOUCH = ('ontouchstart' in W) || (navigator.maxTouchPoints > 0) || /forcetouch/.test(location.search);
  if (IS_TOUCH || !navigator.getGamepads) return;

  var DEADZONE = 0.18, TRIGGER = 0.15;
  var held = {};                 /* synthetic key code -> currently down */
  var lastTap = null, padId = null, connected = false;

  function pressKey(code) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: code, key: code, bubbles: true, cancelable: true }));
  }
  function releaseKey(code) {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: code, key: code, bubbles: true, cancelable: true }));
  }
  function tap(code) {
    pressKey(code);
    setTimeout(function () { releaseKey(code); }, 40);
    lastTap = { code: code, t: Date.now() };
  }
  function setHold(code, want) {
    if (want && !held[code]) { held[code] = true; pressKey(code); }
    else if (!want && held[code]) { held[code] = false; releaseKey(code); }
  }
  /* in-ride HUD visible? (#hud display:block is set on startGame) */
  function riding() {
    var hud = document.getElementById('hud');
    return !!(hud && hud.style.display === 'block');
  }

  /* ---- gamepad -> key mapping ---- */
  function applyPad(pad, prev) {
    function b(i) { return pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > TRIGGER); }
    function edge(i) { return b(i) && !(prev && prev[i]); }
    var ax = pad.axes[0] || 0;

    if (riding()) {
      setHold('ArrowLeft', ax < -DEADZONE || b(14));
      setHold('ArrowRight', ax > DEADZONE || b(15));
      setHold('KeyW', b(7) || b(12));
      setHold('KeyS', b(6) || b(13));
      setHold('Space', b(0));
      if (edge(9)) tap('KeyP');            /* Start = pause */
    } else {
      /* title / loading: A or Start starts the ride (Enter picks the selected diff) */
      setHold('Space', false); setHold('KeyW', false); setHold('KeyS', false);
      setHold('ArrowLeft', false); setHold('ArrowRight', false);
      if (edge(0) || edge(9)) tap('Enter');
    }
    if (edge(3)) tap('KeyM');              /* Y = mute */
    if (edge(5)) tap('KeyC');              /* RB = camera */
    if (edge(4)) tap('KeyH');              /* LB = help */
    if (edge(1)) tap('KeyC');              /* B = camera (thumb-reachable alt) */

    /* rumble: game over (strong), rank up (double pulse), lightning flash (light) */
    rumbleWatch(pad);
    return snapshotButtons(pad);
  }
  function snapshotButtons(pad) {
    var s = [];
    for (var i = 0; i < pad.buttons.length; i++) s.push(!!(pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > TRIGGER)));
    return s;
  }

  /* ---- rumble watchers (polled ~6Hz inside the frame loop) ---- */
  var lastWatch = 0, wasOver = false, wasRank = false, lastFlash = 0;
  function ovVisible(id) {
    var el = document.getElementById(id);
    return !!(el && el.style.display === 'flex');
  }
  function rumble(pad, dur, strong, weak) {
    try {
      if (pad.vibrationActuator && pad.vibrationActuator.playEffect) {
        pad.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration: dur, strongMagnitude: strong, weakMagnitude: weak });
      }
    } catch (e) { /* no actuator — fine */ }
  }
  function rumbleWatch(pad) {
    var now = Date.now();
    if (now - lastWatch < 160) return;
    lastWatch = now;
    var over = ovVisible('gameover'), rank = ovVisible('rankup');
    if (over && !wasOver) rumble(pad, 420, 0.9, 0.5);
    if (rank && !wasRank) { rumble(pad, 110, 0.5, 0.8); setTimeout(function () { rumble(pad, 110, 0.5, 0.8); }, 160); }
    wasOver = over; wasRank = rank;
    if (now - lastFlash > 900) {
      var fl = document.getElementById('flash');
      if (fl && parseFloat(getComputedStyle(fl).opacity) > 0.12) { rumble(pad, 90, 0.25, 0.4); lastFlash = now; }
    }
  }

  /* ---- connect/disconnect toast in the game's own visual language ---- */
  function couchToast(label, line) {
    var box = document.createElement('div');
    box.className = 'toast';
    box.style.cssText = 'position:fixed;right:22px;top:18vh;z-index:90;';
    var tl = document.createElement('span');
    tl.className = 'tl';
    tl.textContent = label;
    box.appendChild(tl);
    box.appendChild(document.createTextNode(line));
    document.body.appendChild(box);
    setTimeout(function () { box.classList.add('out'); }, 3400);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 3800);
  }
  function couchTag() {
    var el = document.getElementById('couchtag');
    if (!el) {
      el = document.createElement('div');
      el.id = 'couchtag';
      el.style.cssText = 'position:fixed;right:26px;bottom:64px;z-index:51;pointer-events:none;' +
        "font-family:Impact,'Arial Black',sans-serif;font-size:10px;letter-spacing:2px;" +
        'color:rgba(242,234,216,.55);display:none;';
      el.textContent = '\uD83C\uDFAE LINKED';
      document.body.appendChild(el);
    }
    el.style.display = connected && riding() ? 'block' : 'none';
  }

  /* ---- main poll loop ---- */
  var prevBtns = null;
  function frame() {
    requestAnimationFrame(frame);
    var pads = navigator.getGamepads();
    var pad = null;
    for (var i = 0; i < pads.length; i++) if (pads[i]) { pad = pads[i]; break; }
    if (pad) {
      if (!connected) { connected = true; padId = pad.id; couchToast('COUCH MODE', ' CONTROLLER LINKED \u2014 STICK STEER \u00b7 RT GAS \u00b7 A CRANK'); }
      prevBtns = applyPad(pad, prevBtns);
    } else if (connected) {
      connected = false; padId = null; prevBtns = null;
      for (var code in held) setHold(code, false);   /* never leave a key stuck down */
      couchToast('COUCH MODE', ' CONTROLLER LOST \u2014 KEYBOARD IS YOUR BROTHER NOW');
    }
    couchTag();
  }
  requestAnimationFrame(frame);

  /* evidence hooks for rigs (read-only) */
  W.HogCouch = {
    state: function () {
      var h = [];
      for (var code in held) if (held[code]) h.push(code);
      return { connected: connected, padId: padId, held: h, lastTap: lastTap };
    }
  };
})();
