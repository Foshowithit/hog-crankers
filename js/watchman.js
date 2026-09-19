/* HOG CRANKERS — WAVE 29 "THE WATCHMAN": the crossing has a keeper.
   A living rigged human (rung-2 character GLB, CMU Idle/Walk clips) posted at the
   wave-25 rail crossing set. Idles at his post beside the east crossbuck mast;
   while a hold-show is active (train staged stopped / gates down) he paces the
   east shoulder carrying a lit lantern; when the train rolls he finishes his leg,
   and after the event disposes he walks home to his post.

   House pattern: js/fauna.js — own namespace window.HogWatchman, silent-safe
   (any load/parse error = console.warn once + dormancy, the game never notices),
   read-only coupling to game state, zero per-frame allocation.

   Coupling (all read-only):
   - xingG  = scene.getObjectByName('xing25')  — the crossing set. The watchman is
     a CHILD of it, so the 6400-stride recycle (placeXing) moves him for free and
     he inherits the set's curve yaw. No game.js edits.
   - Hold detection without state() (state() allocates — never call per frame):
     pace when (a) train25 visible AND frozen (hold-show staging: trainG.position.x
     stops moving — w26 holds the nose at -dir*startPad), OR (b) the east gate is
     down with no train visible (HogTrain._stage rig/still staging). Release when
     the train is visible AND moving (the roll) — he finishes his leg.
   - Lighting: NO new THREE lights (hard rule). His materials are night-graded by
     albedo multiplication only; the lantern is a sub-bloom emissive pip + one
     fog:false additive halo sprite on the HogVisuals.softDotTexture pattern
     (markers28/lampHalo doctrine) so he carries at range like the crossbucks do.

   Perf: 1 skinned mesh (frustumCulled=false, the r128 trap) + 3 lantern draws.
   Mixer + pace math freeze beyond SKIP_DIST (fog eats him there anyway; the halo
   keeps carrying — sprites need no mixer time). Touch tier: same watchman. */

(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : globalThis;
  if (!W.HogDebug || !W.HogDebug.scene || !W.THREE) return;
  var THREE = W.THREE;
  var scene = W.HogDebug.scene;
  var cam = W.HogDebug.camera;

  var xingG = scene.getObjectByName('xing25');
  if (!xingG || !xingG.userData || !xingG.userData.gateE) return;   /* no crossing set: dormant */

  /* ---- tuning constants (baked from in-game stills; see qa/w29-rig + art/w29) ---- */
  var SCALE = 0.92;            /* model is 1.99u tall -> 1.83u man beside the choppers */
  var POST_X = 15.6;           /* east shoulder, local set frame: road edge 12, mast 13.5,
                                  clear of rider lane (+6.8) and the gate sweep (13.5) */
  var POST_Z = -3.3;           /* SOUTH of the equipment cabinet (14.4, z -2.3): out of its
                                 occlusion shadow from the rider's -z approach (still-tuned),
                                 between the mast corner and the pacing leg */
  var PACE_LO = -11.5, PACE_HI = -3.9;   /* pacing leg along the shoulder (local z), ~7.6u */
  var WALK_SPEED = 1.4;        /* u/s — receipt-proven walking translate */
  var TURN_T = 0.5;            /* eased 180 yaw at the leg ends */
  var FADE = 0.25;             /* receipt-proven crossfade timing */
  var SKIP_DIST = 360;         /* beyond this the fog owns him — freeze mixer (halo carries) */
  var NEAR_REAR = -170;        /* how far behind the camera he still animates */
  var GATE_DOWN_Z = 0.9;       /* east gate rotation.z: stowed -0.10 .. full down 1.75 */

  /* night grade: cool moonlight albedo multiply (blue-shifted ~0.64) — reads as a lit
     human at 50-150u, not a black slab, not a daytime tourist. Tuned by still. */
  var NIGHT_R = 0.585, NIGHT_G = 0.635, NIGHT_B = 0.755;
  /* lantern pip: warm, sub-bloom (w28 door-slit line 0.69 linear; pip luma ~0.62) */
  var PIP_R = 1.0, PIP_G = 0.55, PIP_B = 0.17;   /* 0.2126R+0.7152G+0.0722B = 0.618 linear */

  /* ---- state ---- */
  var ready = false, warned = false;
  var mixer = null, idleAct = null, walkAct = null, cur = null, curName = '';
  var grp = null, model = null, skinned = null;
  var pip = null, halo = null;

  /* pace machine: IDLE at post / PACE (walk legs + turns) / PACEOUT (finish the
     current leg after a release, then idle) / HOME (walk to post) */
  var mode = 'idle';           /* idle | pace | paceOut | home */
  var phase = 'leg';           /* leg | turn */
  var legDir = -1;             /* -1 walking toward PACE_LO, +1 toward PACE_HI */
  var turnT = 0, turnFrom = 0, turnTo = 0;
  var holdSeen = false;        /* hold latched this event */
  var forcePaceOverride = null;/* rig-only: true/false deterministic pacing */
  var lastTrainX = null, stopT = 0;

  /* ---- locate the player group (unnamed; find the bike's stand marker —
     cook.js / loiterer.js receipt: climb to the scene-top parent) ---- */
  var playerG = null;
  (function () {
    scene.traverse(function (o) {
      if (playerG || !o.userData || !o.userData.stand) return;
      var top = o;
      while (top.parent && top.parent !== scene) top = top.parent;
      if (top.parent === scene) playerG = top;
    });
  })();
  var greetPlayerDist = -1;   /* probe read: -1 sentinel = no player (Infinity) */

  /* W36 RESIDENTS ANSWER: Pack-style greet on FIRST <70u post proximity per pass
     while riding — a NEW proximity branch (this file has no rung-4 tracking).
     Fires both during a hold-show staged stop and on a plain ride-by: same <70u
     read against the post world pos (POST_X/POST_Z through the set's curve yaw).
     Canon string LOCKED (byte-intact): "HOLD SHOW — PACK COMIN THROUGH!".
     Edge is on the EFFECTIVE read (near && riding): a title-screen approach never
     arms it. Once-per-pass: greetDone set on fire, reset when |dist|>90 OR the
     signed set-dist flips past the site (rode past). 30s cooldown. On fire:
     (1) toast via HogGreet.fire (w15 dedupe owns repeats), (2) arooPop x4 inside
     HogGreet.fire, (3) lantern-halo 1.6s kick (x1.8 on the halo sprite scale),
     (4) a 2s facing hold toward the player (greetHoldT — the faceNow equivalent
     this file never had). Gate: HogGreet.isRiding() — ride/overcrank only, never
     title; GLB-dormant (ready=false) never fires. Zero per-frame alloc. */
  var GREET_LINE = 'HOLD SHOW — PACK COMIN THROUGH!';
  var GREET_DIST = 70;
  var GREET_RESET = 90;
  var GREET_COOL = 30;
  var GREET_CLAMP = 1.9199;   /* +/-110deg off his post heading — no exorcist spin */
  var greetDone = false, greetN = 0, greetLast = -1e9, greetPrevEff = false;
  var greetKickT = 0, greetHoldT = 0;
  var greetHaloBaseX = 0, greetHaloBaseY = 0;
  function greetRiding() {
    if (W.HogGreet && typeof W.HogGreet.isRiding === 'function') {
      try { return !!W.HogGreet.isRiding(); } catch (e) { return false; }
    }
    return false;
  }
  function greetNorm(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
  function greetPostDist() {
    /* post world pos through the set yaw (placeXing curve-yaw receipt) */
    if (!playerG) { greetPlayerDist = -1; return 1e9; }
    var Ry = xingG.rotation.y, c = Math.cos(Ry), s = Math.sin(Ry);
    var pwx = xingG.position.x + POST_X * c + POST_Z * s;
    var pwz = xingG.position.z - POST_X * s + POST_Z * c;
    var dx = playerG.position.x - pwx, dz = playerG.position.z - pwz;
    var d = Math.sqrt(dx * dx + dz * dz);
    greetPlayerDist = d;
    return d;
  }
  function greetResetCheck(d) {
    var ad = d < 0 ? -d : d;
    if (ad > GREET_RESET) { greetDone = false; return; }
    var sdz = xingG ? (xingG.position.z - cam.position.z) : 0;
    if (d < GREET_DIST && sdz < 0) greetDone = false;   /* rode past: signed flip */
  }
  function greetKickStart() {
    if (!halo) return;
    if (!greetHaloBaseX) { greetHaloBaseX = halo.scale.x; greetHaloBaseY = halo.scale.y; }
    /* judge fix: match the cook — 1.8x held 1.6s so the flare reads at dusk range */
    halo.scale.set(greetHaloBaseX * 1.8, greetHaloBaseY * 1.8, 1);
    greetKickT = 1.6;
  }
  function greetKickClock(dt) {
    if (greetKickT > 0) {
      greetKickT -= dt;
      if (greetKickT <= 0 && halo) halo.scale.set(greetHaloBaseX || 2.0, greetHaloBaseY || 2.0, 1);
    }
  }
  function greetFaceClock(dt) {
    /* 2s facing hold toward the player: eased like the rung-4 track ease
       (2.5/s exp, 3.2 rad/s cap, clamped cone), then release back to the machine */
    if (greetHoldT <= 0 || !grp) return;
    greetHoldT -= dt;
    var want = FACE_ROAD_YAW;
    if (playerG) {
      var Ry = xingG.rotation.y, c = Math.cos(Ry), s = Math.sin(Ry);
      var wwx = xingG.position.x + (grp.position.x * c + grp.position.z * s);
      var wwz = xingG.position.z + (-grp.position.x * s + grp.position.z * c);
      var ox = playerG.position.x - wwx, oz = playerG.position.z - wwz;
      var lx = ox * c - oz * s, lz = ox * s + oz * c;
      if (lx * lx + lz * lz > 0.01) want = Math.atan2(lx, lz);
      var rel = greetNorm(want - FACE_ROAD_YAW);
      if (rel > GREET_CLAMP) want = FACE_ROAD_YAW + GREET_CLAMP;
      else if (rel < -GREET_CLAMP) want = FACE_ROAD_YAW - GREET_CLAMP;
    }
    var e = greetNorm(want - grp.rotation.y);
    var step = 2.5 * dt;
    if (step > 1) step = 1;
    var maxStep = 3.2 * dt, de = e * step;
    if (de > maxStep) de = maxStep;
    else if (de < -maxStep) de = -maxStep;
    grp.rotation.y = grp.rotation.y + de;
    if (greetHoldT <= 0) {
      if (mode === 'idle') grp.rotation.y = FACE_ROAD_YAW;
      else if (phase === 'leg') grp.rotation.y = walkYaw(legDir);
    }
  }
  function greetMaybeFire(d, wasEff, nowEff, nowMs) {
    if (!ready || !nowEff || wasEff) return;   /* FIRST effective entry edge only */
    var ad = d < 0 ? -d : d;
    if (ad >= GREET_DIST) return;
    greetResetCheck(d);
    if (greetDone) return;
    if ((nowMs / 1000 - greetLast) < GREET_COOL) return;
    if (!greetRiding()) return;
    greetDone = true; greetN++; greetLast = nowMs / 1000;
    try {
      if (W.HogGreet && typeof W.HogGreet.fire === 'function') W.HogGreet.fire('CROSSING WATCHMAN', GREET_LINE);
    } catch (e) { /* toast is garnish — the proximity read is the feature */ }
    greetKickStart();
    greetHoldT = 2.0;   /* the faceNow-equivalent 2s hold */
  }

  /* ---- lantern texture: reuse the house soft-dot (markers28 pattern) ---- */
  function haloTexture() {
    if (W.HogVisuals && typeof W.HogVisuals.softDotTexture === 'function') {
      return W.HogVisuals.softDotTexture();
    }
    var c = document.createElement('canvas'); c.width = 64; c.height = 64;
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  /* ---- clip fading (receipt choreography: reset + play + crossFadeTo, 0.25s) ---- */
  function fadeTo(next) {
    if (cur === next || !next) return;
    next.reset();
    next.play();
    if (cur) cur.crossFadeTo(next, FADE, false);
    cur = next;
  }
  function setCur(name) {
    if (curName === name) return;
    curName = name;
    fadeTo(name === 'Walk' ? walkAct : idleAct);
  }

  /* facing: verified by in-game still — after Y-up conversion the model natively
     faces +Z in the set's local frame, so facing +z (down-road) is yaw 0 and the
     post-facing -x (across the road, toward traffic) is yaw -PI/2. */
  var FACE_ROAD_YAW = -Math.PI / 2;
  function walkYaw(dir) {              /* face along local z while pacing */
    return dir > 0 ? 0 : Math.PI;
  }

  /* ---- load ---- */
  function onErr(err) {
    if (!warned) { warned = true; console.warn('[watchman] load failed — dormant', (err && err.message) || err); }
  }
  function onLoaded(gltf) {
    try {
      model = gltf.scene;
      model.scale.set(SCALE, SCALE, SCALE);

      /* feet on the ground: probe the bbox (load-time only), sink so min.y = 0 */
      var box = new THREE.Box3().setFromObject(model);
      model.position.y = -box.min.y;

      /* material integration: kill the glTF metalness-1 clay trap + night grade.
         NO new lights — the grade is albedo-only. */
      model.traverse(function (o) {
        if (!o.isMesh) return;
        if (o.isSkinnedMesh) { o.frustumCulled = false; skinned = o; }
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        for (var i = 0; i < mats.length; i++) {
          var mm = mats[i];
          if (!mm) continue;
          if (mm.isMeshStandardMaterial || mm.isMeshPhysicalMaterial) {
            mm.metalness = 0;
            mm.roughness = 1.0;
            mm.metalnessMap = null;        /* forced, belt-and-braces vs the clay trap */
          }
          if (mm.color) mm.color.setRGB(NIGHT_R, NIGHT_G, NIGHT_B);
          mm.needsUpdate = true;
        }
      });

      grp = new THREE.Group();
      grp.name = 'watchman29';
      grp.add(model);

      /* mixer + actions (clips named EXACTLY Idle / Walk per the rig receipt) */
      mixer = new THREE.AnimationMixer(model);
      for (var a = 0; a < gltf.animations.length; a++) {
        var nm = gltf.animations[a].name;
        if (nm === 'Idle') idleAct = mixer.clipAction(gltf.animations[a]);
        else if (nm === 'Walk') walkAct = mixer.clipAction(gltf.animations[a]);
      }
      if (!idleAct || !walkAct) throw new Error('clips Idle/Walk missing');
      idleAct.play(); cur = idleAct; curName = 'Idle';

      buildLantern();

      grp.position.set(POST_X, 0, POST_Z);
      grp.rotation.y = FACE_ROAD_YAW;
      xingG.add(grp);
      ready = true;
    } catch (e) { onErr(e); }
  }

  /* ---- lantern: hand-bone child so it swings with the arm (receipt skeleton names:
     RightHand/LeftHand). Fallback if no hand bone: post-mounted beside his spot. ---- */
  var lanternBone = null;
  function buildLantern() {
    var lant = new THREE.Group();
    lant.name = 'watchmanLantern29';
    var dark = new THREE.MeshLambertMaterial({ color: 0x0b0906 });   /* moonlit doctrine: near-black */
    var cap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.16), dark);
    cap.position.y = -0.16;
    var base = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.16), dark);
    base.position.y = -0.345;
    pip = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.135, 0.105), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    pip.material.color.setRGB(PIP_R, PIP_G, PIP_B);
    pip.position.y = -0.25;
    halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTexture(), transparent: true, opacity: 0.55, depthWrite: false,
      fog: false, blending: THREE.AdditiveBlending
    }));
    halo.material.color.setRGB(1.0, 0.62, 0.26);
    halo.scale.set(2.0, 2.0, 1);   /* ~1.84u world — carries the read past 150u like the w25 lamp halos (2.3u) */
    halo.position.y = -0.25;
    lant.add(cap); lant.add(base); lant.add(pip); lant.add(halo);
    lant.position.set(0, -0.02, 0.02);

    var hand = null;
    (function find(o) {                     /* deep-find the hand bone */
      if (hand) return;
      if (o.isBone && (o.name === 'RightHand' || o.name === 'LeftHand')) { hand = o; return; }
      for (var i = 0; i < o.children.length; i++) find(o.children[i]);
    })(model);
    if (hand) { hand.add(lant); lanternBone = hand.name; }
    else {
      /* documented fallback: pole lantern beside the post */
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.35, 6), dark);
      pole.position.set(POST_X - 0.9, 0.67, POST_Z + 0.9);
      lant.position.set(POST_X - 0.9, 1.25, POST_Z + 0.9);
      xingG.add(pole); xingG.add(lant);
      lanternBone = 'pole';
    }
  }

  try {
    if (typeof THREE.GLTFLoader !== 'function') throw new Error('GLTFLoader missing');
    new THREE.GLTFLoader().load('assets/watchman.glb', onLoaded, undefined, onErr);
  } catch (e) { onErr(e); }

  /* ---- hold detection (zero alloc): train visible + frozen = hold; train visible +
     moving = roll (release); no train + gate down = staged hold (rig/_stage stills) ---- */
  var trainG = null;
  (function () {
    for (var i = 0; i < xingG.children.length; i++) {
      if (xingG.children[i].name === 'train25') { trainG = xingG.children[i]; break; }
    }
  })();

  function holdActive() {
    if (forcePaceOverride !== null) return forcePaceOverride;
    var gateDown = xingG.userData.gateE.rotation.z > GATE_DOWN_Z;
    if (trainG && trainG.visible) {
      var tx = trainG.position.x;
      if (lastTrainX === null) { lastTrainX = tx; return gateDown; }
      if (tx !== lastTrainX) { lastTrainX = tx; stopT = 0; return false; }  /* rolling */
      return gateDown || stopT > 0.25;
    }
    lastTrainX = null;
    return gateDown;
  }

  /* ---- pace machine (all writes are numbers on cached handles — zero alloc) ---- */
  function tickPace(dt) {
    if (phase === 'turn') {
      turnT += dt;
      var f = Math.min(turnT / TURN_T, 1);
      f = f * f * (3 - 2 * f);                       /* smoothstep ease */
      grp.rotation.y = turnFrom + (turnTo - turnFrom) * f;
      if (turnT >= TURN_T) phase = 'leg';
      return;
    }
    var z = grp.position.z + legDir * WALK_SPEED * dt;
    var hitLo = legDir < 0 && z <= PACE_LO;
    var hitHi = legDir > 0 && z >= PACE_HI;
    if (hitLo) z = PACE_LO;
    if (hitHi) z = PACE_HI;
    grp.position.z = z;
    if (hitLo || hitHi) {
      if (mode === 'home') { arriveHome(); return; }
      if (mode === 'pace') {                         /* end of leg: eased 180, walk back */
        var next = -legDir;
        phase = 'turn'; turnT = 0;
        turnFrom = walkYaw(legDir);
        turnTo = walkYaw(next);
        legDir = next;
      } else {                                       /* paceOut: released — stop here */
        arriveStop();
      }
    }
  }
  function arriveStop() {                            /* finished a leg, no hold */
    mode = 'idle';
    setCur('Idle');
    grp.rotation.y = FACE_ROAD_YAW;
  }
  function arriveHome() {                            /* back at the post */
    mode = 'idle'; phase = 'leg';
    grp.position.z = POST_Z;
    setCur('Idle');
    grp.rotation.y = FACE_ROAD_YAW;
  }
  function startPacing() {
    if (mode === 'pace') return;
    mode = 'pace'; phase = 'leg';
    holdSeen = true;
    /* heading for the nearer leg end so the first pass reads immediately */
    legDir = (grp.position.z - POST_Z) < -0.5 ? 1 : -1;
    if (grp.position.z > PACE_HI) grp.position.z = PACE_HI;
    if (grp.position.z < PACE_LO) grp.position.z = PACE_LO;
    setCur('Walk');
    grp.rotation.y = walkYaw(legDir);
  }

  /* ---- main loop: same freeze/sleep discipline as fauna.js ---- */
  var pauseov = document.getElementById('pauseov');
  var prevT = 0;

  function tick(now) {
    requestAnimationFrame(tick);
    if (!ready) return;
    if (document.hidden) { prevT = now; return; }
    if (pauseov && pauseov.style.display === 'flex') { prevT = now; return; }
    var dt = prevT ? Math.min((now - prevT) / 1000, 0.05) : 0.016;
    prevT = now;

    /* distance gate vs the camera: fog owns him past SKIP_DIST — freeze everything.
       The halo sprite needs no mixer time and carries the far read, markers28-style. */
    var dz = xingG.position.z - cam.position.z;
    if (dz < NEAR_REAR || dz > SKIP_DIST) return;

    var held = holdActive();
    if (held) {
      stopT += dt;
      startPacing();
    } else if (mode === 'pace') {
      /* release: finish the current leg to its natural stop point (tickPace lands
         arriveStop at the leg end), then idle */
      mode = 'paceOut';
    }
    if (mode !== 'idle') tickPace(dt);

    /* event disposed while we were away from the post: walk home (Idle otherwise) */
    if (holdSeen && trainG && !trainG.visible && mode === 'idle') {
      holdSeen = false;
      if (Math.abs(grp.position.z - POST_Z) > 0.05) {
        mode = 'home'; phase = 'leg';
        setCur('Walk');
        legDir = grp.position.z < POST_Z ? 1 : -1;
        grp.rotation.y = walkYaw(legDir);
      }
    }

    /* W36 greet clocks + fire check: kick + face-hold easing run on the clock (plain
       number accumulators — no NaN when the mixer skips), then the proximity check.
       The face clock runs AFTER tickPace each frame so the 2s hold wins even mid
       pace-turn; when the hold releases the machine resumes on its own yaw. */
    greetKickClock(dt);
    greetFaceClock(dt);
    var greetD36 = greetPostDist();
    greetResetCheck(greetD36);
    var nowEff36 = (greetD36 < GREET_DIST) && greetRiding();
    greetMaybeFire(greetD36, greetPrevEff, nowEff36, now);
    greetPrevEff = nowEff36;

    if (mixer) mixer.update(dt);
  }
  requestAnimationFrame(tick);

  /* ---- probes (HogFauna precedent): readable headless + rig-only determinism ---- */
  W.HogWatchman = {
    state: function () {
      var wp = null, lz = null;
      if (grp) {
        var e = grp.matrixWorld.elements;              /* read world pos, no allocation */
        wp = { x: +e[12].toFixed(2), y: +e[13].toFixed(2), z: +e[14].toFixed(2) };
        lz = { x: +grp.position.x.toFixed(2), y: +grp.position.y.toFixed(2), z: +grp.position.z.toFixed(2) };
      }
      var dz = xingG ? (xingG.position.z - cam.position.z) : 0;
      return {
        ready: ready,
        failed: warned,
        clip: curName,
        mode: mode,
        pacing: mode === 'pace',
        dist: +dz.toFixed(1),
        visible: !!(ready && grp && dz > NEAR_REAR && dz < SKIP_DIST),
        lanternLit: !!(pip && halo && halo.material.opacity > 0),
        lanternBone: lanternBone,
        playerDist: greetPlayerDist === -1 ? -1 : +greetPlayerDist.toFixed(1),
        greetN: greetN,
        lastGreet: greetN > 0 ? +greetLast.toFixed(2) : -1,
        local: lz,
        world: wp,
        yaw: grp ? +grp.rotation.y.toFixed(3) : 0,
        scale: SCALE,
        gate: +xingG.userData.gateE.rotation.z.toFixed(3),
        trainVisible: !!(trainG && trainG.visible),
        holdSeen: holdSeen,
        skinnedCulled: skinned ? skinned.frustumCulled : null,
        mixerTime: mixer ? +mixer.time.toFixed(3) : -1
      };
    },
    /* rig-only deterministic handles (flushAll precedent) */
    forcePace: function (on) {
      forcePaceOverride = on === true ? true : (on === false ? false : null);
      return this.state();
    },
    walkHome: function () {
      if (!ready) return null;
      mode = 'home'; phase = 'leg';
      setCur('Walk');
      legDir = grp.position.z < POST_Z ? 1 : -1;
      grp.rotation.y = walkYaw(legDir);
      return this.state();
    },
    setYaw: function (y) { if (ready) { grp.rotation.y = y; return true; } return false; }
  };
})();
