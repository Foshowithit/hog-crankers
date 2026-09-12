/* ==========================================================================
   HOG CRANKERS — voice.js
   Pack narration via the Web Speech API. One deep biker voice calls the
   beats: quests, deliveries, rank ups, maximum cranks, blowed engines.
   Wholesome. Loud. Sentence case ONLY (some TTS engines spell out
   ALL-CAPS words, and nobody wants "M-F-E-R" spelled letter by letter).

   Plain script (ES2019). No imports, no dependencies. Guarded everywhere:
   no speechSynthesis means every method is a safe no-op that never throws.

   Attaches ONE global: window.HogVoice
     - HogVoice.prime()            call once on first user gesture; unlocks
                                   iOS speech (speak+cancel a silent utterance)
     - HogVoice.say(text, opts)    opts {priority:'high'|'low', pitch, rate}
                                   'high' flushes the queue (cancel) then speaks
                                   'low'  drops if already speaking (and honors
                                          a 700ms cooldown so hold-release spam
                                          never machine-guns speech)
     - HogVoice.event(name, det)   named beats:
        title        "Nobody cranks alone. Pick your hog, brother."
        start        pack accepts you, ride out
        quest        det {name, distress} -> "Brother in need!" + distress
        deliver      brother delivered, one more hog on the road
        rankup       det {tier} -> "The pack sees you. You are now <tier>."
        maxcrank     det {chain} -> "Maximum crank! Chain of <chain>."
        overcrank    you blowed the engine, walk it off brother
        respawn      back on the hog
        attach       hooked on, don't drop your brother
        crankPerfect short "AROOO!" (low priority, pitch 0.5 rate 1.15)
        hoa          "The H.O.A. smells weakness, brother."
     - HogVoice.setMuted(bool)     true: cancel current speech, drop all new
     - HogVoice.muted              current mute state
     - HogVoice.unlocked           true after prime()
     - HogVoice._lastLine          last line dispatched to the synth (debug
                                   hook for headless tests)

   Priority map: deliver/rankup/overcrank/quest (and the other big story
   beats) = high. crankPerfect / crank flavor = low. say() defaults to high.
   ========================================================================== */
(function () {
  'use strict';

  var synth = (typeof window !== 'undefined' && window.speechSynthesis) ? window.speechSynthesis : null;
  var USSU = (typeof window !== 'undefined' && window.SpeechSynthesisUtterance) ? window.SpeechSynthesisUtterance : null;
  var supported = !!(synth && USSU);

  var muted = false;
  var voice = null;
  var voiceTries = 0;
  var lastLowAt = 0;
  var LOW_COOLDOWN = 700;

  var api = {
    prime: prime,
    say: say,
    event: event,
    setMuted: setMuted,
    unlocked: false,
    _lastLine: ''
  };
  try {
    Object.defineProperty(api, 'muted', {
      get: function () { return muted; },
      set: function (v) { setMuted(v); },
      enumerable: true,
      configurable: true
    });
  } catch (e) { api.muted = muted; }

  window.HogVoice = api;

  /* ---------------- utils ---------------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  // ALL CAPS quest distress / tier names come in here — go out calm.
  function sentenceCase(s) {
    var t = String(s == null ? '' : s).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    if (!t) return '';
    t = t.toLowerCase();
    t = t.replace(/\bi\b/g, 'I');
    t = t.charAt(0).toUpperCase() + t.slice(1);
    t = t.replace(/([.!?])\s+([a-z])/g, function (m, p, c) { return p + ' ' + c.toUpperCase(); });
    return t;
  }

  function stripEnd(s) {
    return String(s == null ? '' : s).replace(/[.!?\s]+$/, '');
  }

  /* ---------------- voice pick ---------------- */
  // Deep/male en voices first, else first 'en' voice, else whatever exists.
  var PREFERRED = ['daniel', 'fred', 'alex', 'aaron', 'google uk english male', 'microsoft david', 'microsoft guy', 'rishi'];

  function pickVoice() {
    if (!synth) return null;
    var voices = [];
    try { voices = synth.getVoices() || []; } catch (e) { voices = []; }
    if (!voices.length) return null;
    var en = [];
    for (var i = 0; i < voices.length; i++) {
      var lang = String(voices[i].lang || '').toLowerCase();
      if (lang.indexOf('en') === 0) en.push(voices[i]);
    }
    var pool = en.length ? en : voices;
    for (var p = 0; p < PREFERRED.length; p++) {
      for (var j = 0; j < pool.length; j++) {
        var nm = String(pool[j].name || '').toLowerCase();
        if (nm.indexOf(PREFERRED[p]) !== -1) return pool[j];
      }
    }
    return en.length ? en[0] : voices[0];
  }

  function refreshVoice() { voice = pickVoice(); }

  // Chrome populates getVoices() asynchronously; Safari fires voiceschanged.
  function startVoiceWatch() {
    if (!synth) return;
    try {
      if (typeof synth.addEventListener === 'function') {
        synth.addEventListener('voiceschanged', refreshVoice);
      } else {
        synth.onvoiceschanged = refreshVoice;
      }
    } catch (e) {}
    var timer = setInterval(function () {
      voiceTries++;
      refreshVoice();
      if (voice || !supported || voiceTries > 20) clearInterval(timer);
    }, 400);
  }

  /* ---------------- speech core ---------------- */
  function isBusy() {
    if (!supported) return false;
    try { return !!(synth.speaking || synth.pending); } catch (e) { return false; }
  }

  function flushQueue() {
    if (!supported) return;
    try { synth.cancel(); } catch (e) {}
  }

  function speakNow(text, pitch, rate) {
    var u;
    try { u = new USSU(text); } catch (e) { return false; }
    try {
      if (voice) u.voice = voice;
      u.lang = (voice && voice.lang) ? voice.lang : 'en-US';
      u.pitch = clamp(pitch, 0.1, 2);
      u.rate = clamp(rate, 0.5, 2);
      u.volume = 1;
      synth.speak(u);
      api._lastLine = text;
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- public: say ---------------- */
  function say(text, opts) {
    try {
      opts = opts || {};
      if (!supported || muted) return false;
      var t = sentenceCase(text);
      if (!t) return false;
      var high = opts.priority !== 'low';   // default: flush-then-speak
      if (high) {
        flushQueue();
      } else {
        if (isBusy()) return false;
        var now = Date.now();
        if (now - lastLowAt < LOW_COOLDOWN) return false;
        lastLowAt = now;
      }
      // Pack treatment: deep pitch ~0.55–0.8 (jitters ±0.06 per line), steady rate.
      var pitch = (typeof opts.pitch === 'number') ? opts.pitch : rand(0.61, 0.74) + rand(-0.06, 0.06);
      var rate = (typeof opts.rate === 'number') ? opts.rate : rand(0.95, 1.08);
      return speakNow(t, pitch, rate);
    } catch (e) { return false; }
  }

  /* ---------------- public: prime ---------------- */
  // iOS quirk: the synth stays locked until a user-gesture utterance runs.
  // Speak a silent one, cancel it, and the pack has the mic from then on.
  function prime() {
    api.unlocked = true;
    try {
      if (!supported) return;
      flushQueue();
      var u = new USSU(' ');
      u.volume = 0;
      u.pitch = 0.6;
      u.rate = 1;
      synth.speak(u);
      flushQueue();
      refreshVoice();
    } catch (e) {}
  }

  /* ---------------- public: setMuted ---------------- */
  function setMuted(m) {
    muted = !!m;
    if (muted) flushQueue();
  }

  /* ---------------- lines ---------------- */
  var LINES = {
    title: [
      'Nobody cranks alone. Pick your hog, brother.',
      'Welcome to Crank County, brother. Choose your machine.',
      'The moon is a skull and the road is waiting. Pick your hog.'
    ],
    start: [
      'The pack has received you, brother. Ride out and crank the hog.',
      'Pipes hot, heart full. Ride, brother. AROOO!',
      'You ride with the pack tonight. Answer the signals. Hell yeah, brother.'
    ],
    deliver: [
      'One more hog on the road. AROOO!',
      'Brother delivered. The pack respects you.',
      'He rides again because of you. Hell yeah, brother.'
    ],
    overcrank: [
      'You blowed the engine, brother. Walk it off. The pack is on the way.',
      'Too much hog, even for us. Take a breath, brother.',
      'The hog gave everything. So did you. We ride again in a minute.'
    ],
    respawn: [
      'Back on the hog. AROOO!',
      'That is the spirit, brother. The pack got you running.',
      'Kickstand up. Nobody stays down in this pack.'
    ],
    attach: [
      'Hooked on. Do not drop your brother, brother.',
      'Rope is tight and your brother is aboard. Easy on the throttle.',
      'He is behind you now. You never drop a brother. Ever.'
    ],
    crankPerfect: [
      'AROOO!',
      'Hell yeah!',
      'WOO!'
    ],
    hoa: [
      'The H.O.A. smells weakness, brother.',
      'A beige crossover approaches. The H.O.A. rides at dawn.',
      'The H.O.A. has filed a complaint about your joy, brother.'
    ]
  };

  /* ---------------- public: event ---------------- */
  function event(name, detail) {
    try {
      detail = detail || {};
      switch (name) {
        case 'title':
          return say(pick(LINES.title), { priority: 'low' });
        case 'start':
          return say(pick(LINES.start), { priority: 'high' });
        case 'quest': {
          var d = sentenceCase(stripEnd(detail.distress));
          if (!d) return false;
          var who = detail.name ? sentenceCase(detail.name) : 'A brother';
          return say(pick([
            'Brother in need! ' + d + '. Hold on, brother. The pack is coming.',
            who + ' calls the pack! ' + d + '. We ride, brother.',
            'A brother signals! ' + d + '. Nobody cranks alone.'
          ]), { priority: 'high' });
        }
        case 'deliver':
          return say(pick(LINES.deliver), { priority: 'high' });
        case 'rankup': {
          var tier = (detail.tier != null && detail.tier !== '') ? sentenceCase(detail.tier) : 'a brother';
          return say(pick([
            'The pack sees you. You are now ' + tier + '.',
            'Respect earned. The pack names you ' + tier + '. AROOO!',
            'The road knows your name, brother. ' + tier + '. Wear it loud.'
          ]), { priority: 'high' });
        }
        case 'maxcrank': {
          var n = (detail.chain != null && detail.chain !== '') ? String(detail.chain) : '';
          var line = n
            ? pick([
              'Maximum crank! Chain of ' + n + '. Hell yeah, brother!',
              'Maximum crank, chain of ' + n + '! The county heard that one, brother.',
              'Chain of ' + n + '! The hogs answer to you now. AROOO!'
            ])
            : pick([
              'Maximum crank! Hell yeah, brother!',
              'Maximum crank! AROOO!'
            ]);
          return say(line, { priority: 'high' });
        }
        case 'overcrank':
          return say(pick(LINES.overcrank), { priority: 'high' });
        case 'respawn':
          return say(pick(LINES.respawn), { priority: 'high' });
        case 'attach':
          return say(pick(LINES.attach), { priority: 'high' });
        case 'crankPerfect':
          return say(pick(LINES.crankPerfect), { priority: 'low', pitch: 0.5, rate: 1.15 });
        case 'hoa':
          return say(pick(LINES.hoa), { priority: 'high' });
        default:
          return false;
      }
    } catch (e) { return false; }
  }

  /* ---------------- boot ---------------- */
  try {
    refreshVoice();
    startVoiceWatch();
  } catch (e) {}
})();
