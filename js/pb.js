/* HOG CRANKERS — ALL-TIME BESTS (side-lane wave S1, branch sidelane/fauna-couch-v1)
   The game persists nothing (verified: zero localStorage anywhere). This tracks two
   honest numbers — top speed and longest ride — samples them from the HUD the player
   already sees (#speedval), commits on game over, and shows them on the title screen
   as one quiet injected panel. Pure add-on: reads existing DOM, injects its own node,
   zero game.js edits. localStorage guarded (private-mode Safari throws). */
(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : globalThis;
  var KEY = 'hog_pb_v1';
  var store = null;
  try {
    store = window.localStorage;
    var raw = store.getItem(KEY);
    var pb = raw ? JSON.parse(raw) : {};
    if (typeof pb.topKph !== 'number') pb.topKph = 0;
    if (typeof pb.rideSecs !== 'number') pb.rideSecs = 0;
  } catch (e) { store = null; var pb = { topKph: 0, rideSecs: 0 }; }

  var run = { topKph: 0, secs: 0, over: false };
  var panel = null;

  function visible(id, val) {
    var el = document.getElementById(id);
    return !!(el && el.style.display === val);
  }
  function fmt(secs) {
    var m = Math.floor(secs / 60), s = Math.floor(secs % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function save() {
    if (!store) return;
    try { store.setItem(KEY, JSON.stringify(pb)); } catch (e) { /* private mode */ }
  }
  function panelText() {
    if (!pb.topKph && !pb.rideSecs) return 'NO RIDES YET \u2014 FIRST CRANK SETS THE BAR';
    return 'ALL-TIME BEST \u2014 ' + Math.round(pb.topKph) + ' KPH \u00b7 RIDE ' + fmt(pb.rideSecs);
  }
  function mountPanel() {
    var title = document.getElementById('title'), controls = document.getElementById('controls');
    if (!title || !controls || document.getElementById('pbpanel')) return;
    panel = document.createElement('div');
    panel.id = 'pbpanel';
    panel.style.cssText = 'text-align:center;margin:14px 0 2px;font-size:13px;letter-spacing:2px;' +
      'color:rgba(242,234,216,.66);text-transform:uppercase;';
    panel.textContent = panelText();
    title.insertBefore(panel, controls);
  }

  /* sample the live ride at 2Hz; commit when the game-over overlay appears */
  setInterval(function () {
    var riding = visible('hud', 'block');
    var over = visible('gameover', 'flex');
    if (riding && !over && !visible('pauseov', 'flex')) {
      run.secs += 0.5;
      var sv = document.getElementById('speedval');
      var kph = sv ? parseInt(sv.textContent, 10) || 0 : 0;
      if (kph > run.topKph) run.topKph = kph;
    }
    if (over && !run.over) {
      run.over = true;
      var beat = run.topKph > pb.topKph || run.secs > pb.rideSecs;
      if (run.topKph > pb.topKph) pb.topKph = run.topKph;
      if (run.secs > pb.rideSecs) pb.rideSecs = run.secs;
      if (beat) save();
      if (beat && panel) { panel.textContent = panelText(); panel.style.color = '#d8ff00'; }
    }
    if (!over && run.over) { run.over = false; run.topKph = 0; run.secs = 0; }
  }, 500);

  if (document.readyState === 'complete' || document.readyState === 'interactive') mountPanel();
  else document.addEventListener('DOMContentLoaded', mountPanel);

  /* evidence hook (read-only) */
  W.HogPB = {
    state: function () {
      return { allTime: { topKph: Math.round(pb.topKph), rideSecs: Math.round(pb.rideSecs) },
               run: { topKph: run.topKph, secs: Math.round(run.secs) },
               persisted: !!store, panelMounted: !!(panel && panel.parentNode) };
    }
  };
})();
