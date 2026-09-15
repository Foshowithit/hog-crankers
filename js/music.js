/* hog-crankers · js/music.js — WAVE 6: YuE2-forged soundtrack lane.
 * Two loops: assets/music/menu-theme.mp3 (title) + assets/music/ride-anthem.mp3 (riding).
 * Own AudioContext + MediaElementSource graph (audio.js stays untouched); KeyM mute
 * syncs via HogMusic.setMute from game.js. Everything exception-safe: a missing or
 * blocked track just means silence — never a console error, never a broken ride.
 * Attaches exactly ONE global: window.HogMusic. */
window.HogMusic = (function () {
  var TRACKS = [
    { name: 'menu-theme', vol: 0.5 },
    { name: 'ride-anthem', vol: 0.58 }
  ];
  var ctx = null, master = null;
  var tracks = {};        /* name -> { el, gain, broken } */
  var current = null;
  var muted = false;

  function ensure() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      for (var i = 0; i < TRACKS.length; i++) build(TRACKS[i]);
      return true;
    } catch (e) { ctx = null; return false; }
  }
  function build(t) {
    try {
      var el = new Audio('assets/music/' + t.name + '.mp3');
      el.loop = true;
      el.preload = 'auto';
      var src = ctx.createMediaElementSource(el);
      var g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g);
      g.connect(master);
      tracks[t.name] = { el: el, gain: g, vol: t.vol, broken: false };
      el.addEventListener('error', function () { tracks[t.name].broken = true; });
    } catch (e) { tracks[t.name] = { broken: true }; }
  }
  function play(name) {
    if (!ensure()) return;
    var t = tracks[name];
    if (!t || t.broken || current === name) return;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    var swap = current ? tracks[current] : null;
    var pr;
    try { pr = t.el.play(); } catch (e) { return; }
    if (pr && pr.then) {
      pr.then(function () { go(t, swap, name); }).catch(function () {});
    } else { go(t, swap, name); }
  }
  function go(t, swap, name) {
    if (swap) {
      swap.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      setTimeout(function () { try { swap.el.pause(); } catch (e) {} }, 1500);
    }
    t.gain.gain.setTargetAtTime(muted ? 0 : t.vol, ctx.currentTime, 0.7);
    current = name;
  }
  return {
    toMenu: function () { play('menu-theme'); },
    toRide: function () { play('ride-anthem'); },
    setMute: function (m) {
      muted = (m === true || m === 1 || m === 'true');
      if (ctx && master) {
        try { master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05); } catch (e) {}
      }
      return muted;
    }
  };
})();
