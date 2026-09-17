/* HOG CRANKERS — WAVE 30 "THE LOITERER": the gas station has a regular.
   Second living character (rung 4): a rigged human posted on the DED HOG GAS-N-GO
   forecourt — the hero venue (title orbit + every ride start). New rung-4 behavior:
   HE NOTICES THE PLAYER. Within ~70u his facing eases toward the player bike
   (exponential yaw ease ~2.5/s, capped 3.2 rad/s, clamped +/-110 deg off his post
   heading — no exorcist spin). While mid-leg he finishes the leg heading; when
   idle/at a leg-end stare pause he faces the player.

   House pattern: js/watchman.js / js/fauna.js — own namespace window.HogLoiterer,
   silent-safe (any load/parse error = console.warn once + dormancy, the game never
   notices), read-only coupling to game state, zero per-frame allocation.

   Coupling (all read-only, resolved ONCE at load):
   - gasStation: the station group is UNNAMED (game.js:822) — located via its pad
     mesh (BoxGeometry 26 x 0.2 x 20, game.js:854; same geometry-params trick as the
     w29 rig's hideQuestDest). The station never recycles (pinned at roadX(30),0,30
     both title :4093 and ride :4349), so childing to it is recycle-free.
   - player: the player group is UNNAMED (game.js:2069) — located via playerBike's
     userData.stand marker (game.js:1969), climbing to the scene child. Its
     .position IS the bike's world position (synced every frame, game.js:4204).
     Read per frame as two numbers. Never written.

   Looks: same watchman.glb (browser HTTP cache already holds it from watchman.js —
   zero extra download bytes; this module parses its OWN independent instance and
   shares NO THREE objects with the watchman). Scale 0.88 (~1.75m — visibly a
   different man than the 1.83m watchman). Materials cloned and albedo-tinted UNDER
   the night grade (worn warm-brown read vs the watchman's cool gray-blue).

   Lighting: NO lantern, NO emissive props, NO new THREE lights (hard rule). The
   station glow light (game.js:914) lights him; HE is the life.

   Perf: 1 skinned mesh (frustumCulled=false, the r128 trap). Entire feature is
   +1 draw call (budget <= +3). Mixer + state machine freeze beyond SKIP_DIST 360 /
   behind NEAR_REAR -170 (fog owns him; matters on the ride-out). Touch tier: same
   loiterer, no IS_TOUCH split. */

(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : globalThis;
  if (!W.HogDebug || !W.HogDebug.scene || !W.THREE) return;
  var THREE = W.THREE;
  var scene = W.HogDebug.scene;
  var cam = W.HogDebug.camera;

  /* ---- locate the station group (unnamed; find the pad mesh, climb to scene child).
     Probe verdict: gasStation.position must be at the station home (z 30). ---- */
  var gasStation = null;
  (function () {
    scene.traverse(function (o) {
      if (gasStation || !o.isMesh || !o.geometry || !o.geometry.parameters) return;
      var p = o.geometry.parameters;
      if (p.width === 26 && p.height === 0.2 && p.depth === 20) {
        var top = o;
        while (top.parent && top.parent !== scene) top = top.parent;
        if (top.parent === scene) gasStation = top;
      }
    });
  })();
  if (!gasStation) return;   /* no station: dormant */

  /* ---- locate the player group (unnamed; find the bike's stand marker) ---- */
  var playerG = null;
  (function () {
    scene.traverse(function (o) {
      if (playerG || !o.userData || !o.userData.stand) return;
      var top = o;
      while (top.parent && top.parent !== scene) top = top.parent;
      if (top.parent === scene) playerG = top;
    });
  })();

  /* ---- tuning constants ---- */
  var SCALE = 0.88;            /* model is 1.99u tall -> ~1.75m man (watchman is 1.83m) */
  var HOME_X = -3.0;           /* his spot on the forecourt (station-local): between the
                                  westbound car sweep (car bodies lat -7.0..-4.5) and the
                                  bike start spot (+6.8), south of the pump band (z 0) */
  var HOME_Z = -5.8;           /* under the canopy south face, in the title settle frame */
  var BOX_X0 = -4.2, BOX_X1 = 4.2;   /* pacing walk box (station-local x), hard clamp */
  var BOX_Z0 = -6.4, BOX_Z1 = -5.2;  /* pacing walk box (station-local z), hard clamp */
  var WALK_SPEED = 1.4;        /* u/s — watchman receipt-proven walking translate */
  var TURN_T = 0.5;            /* eased yaw at leg starts (spec: 0.5s turn) */
  var FADE = 0.25;             /* watchman receipt-proven crossfade timing */
  var SKIP_DIST = 360;         /* beyond this the fog owns him — freeze mixer + machine */
  var NEAR_REAR = -170;        /* how far behind the camera he still animates */
  var IDLE_LO = 5, IDLE_HI = 12;      /* randomized idle holds (spec 5-12s) */
  var STARE_LO = 1.4, STARE_HI = 3.2; /* leg-end stare pause before the next decision */
  var LEG_LO = 4, LEG_HI = 8;         /* short pacing legs (spec 4-8u) */
  var PACE_CHANCE = 0.6;       /* idle expiry: pace vs re-hold */
  var CHAIN_CHANCE = 0.45;     /* leg end: another leg vs walk home */
  var TRACK_DIST = 70;         /* rung-4: notice the player within ~70u */
  var TRACK_RATE = 2.5;        /* exponential yaw ease toward the player (spec ~2.5/s) */
  var TRACK_CAP = 3.2;         /* hard rad/s cap so the ease never whips */
  var TRACK_CLAMP = 1.9199;    /* +/-110 deg off his post heading — no exorcist spin */

  /* anchor: his POST heading — east (+x, yaw +PI/2), watching the forecourt.
     Model natively faces +Z at yaw 0 (watchman receipt), so +x is yaw +PI/2. */
  var ANCHOR_YAW = Math.PI / 2;

  /* night grade: the SAME cool moonlight multiply the watchman uses (game reads as
     one lit night), applied ON TOP of his own albedo tint (worn warm-brown jacket
     read — visibly a different man; tuned by still). */
  var NIGHT_R = 0.585, NIGHT_G = 0.635, NIGHT_B = 0.755;
  var TINT_R = 1.28, TINT_G = 0.90, TINT_B = 0.62;   /* warm-brown under the grade */

  /* ---- state ---- */
  var ready = false, warned = false;
  var mixer = null, idleAct = null, walkAct = null, cur = null, curName = '';
  var grp = null, model = null, skinned = null;

  /* machine: idle (at home spot, randomized hold) / pause (leg-end stare) /
     turn (eased 0.5s into a walk heading) / leg (paced walk) / home (walk back) */
  var mode = 'idle';
  var holdT = 3;               /* first hold: settle in, then live */
  var legDir = 1;              /* -1 walking toward BOX_X0, +1 toward BOX_X1 */
  var legTargetX = HOME_X;
  var turnT = 0, turnFrom = 0, turnTo = 0, turnNext = '';
  var forcePaceOverride = null;/* rig-only: true/false deterministic pacing */
  var trackOverrideT = 0;      /* rig-only faceNow(): force tracking for N seconds */

  /* tracking readout (per frame numbers, no allocation) */
  var tracking = false, targetYaw = ANCHOR_YAW, playerDist = -1;

  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

  /* ---- clip fading (watchman receipt choreography) ---- */
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

  /* facing: model natively faces +Z (watchman receipt). Pacing runs along local x,
     so the walk yaws are +/-PI/2. */
  function walkYaw(dir) { return dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
  function normAng(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

  /* tracked facing target: toward the player, clamped to the +/-110deg cone around
     his post heading so he never spins exorcist */
  function trackedYaw() {
    var e = gasStation.position;
    var wx = e.x + grp.position.x, wz = e.z + grp.position.z;
    var px = playerG ? playerG.position.x : wx + Math.sin(ANCHOR_YAW) * 10;
    var pz = playerG ? playerG.position.z : wz + Math.cos(ANCHOR_YAW) * 10;
    var want = Math.atan2(px - wx, pz - wz);
    var d = normAng(want - ANCHOR_YAW);
    if (d > TRACK_CLAMP) d = TRACK_CLAMP;
    if (d < -TRACK_CLAMP) d = -TRACK_CLAMP;
    return ANCHOR_YAW + d;
  }

  /* exponential yaw ease toward target, capped — returns new yaw (all numbers) */
  function easeYaw(from, to, dt) {
    var d = normAng(to - from);
    var step = d * (1 - Math.exp(-TRACK_RATE * dt));
    if (step > TRACK_CAP * dt) step = TRACK_CAP * dt;
    if (step < -TRACK_CAP * dt) step = -TRACK_CAP * dt;
    return from + step;
  }

  /* ---- load ---- */
  function onErr(err) {
    if (!warned) { warned = true; console.warn('[loiterer] load failed — dormant', (err && err.message) || err); }
  }
  function onLoaded(gltf) {
    try {
      model = gltf.scene;
      model.scale.set(SCALE, SCALE, SCALE);

      /* feet on the ground: probe the bbox (load-time only), sink so min.y = 0 */
      var box = new THREE.Box3().setFromObject(model);
      model.position.y = -box.min.y;

      /* material integration: CLONE each material (this man is his own), kill the
         glTF metalness-1 clay trap, tint albedo UNDER the watchman night grade.
         NO new lights — the station glow lights him. */
      model.traverse(function (o) {
        if (!o.isMesh) return;
        if (o.isSkinnedMesh) { o.frustumCulled = false; skinned = o; }
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        var cloned = [];
        for (var i = 0; i < mats.length; i++) {
          var mm = mats[i] ? mats[i].clone() : null;
          cloned.push(mm);
          if (!mm) continue;
          if (mm.isMeshStandardMaterial || mm.isMeshPhysicalMaterial) {
            mm.metalness = 0;
            mm.roughness = 1.0;
            mm.metalnessMap = null;        /* forced, belt-and-braces vs the clay trap */
          }
          if (mm.color) mm.color.setRGB(NIGHT_R * TINT_R, NIGHT_G * TINT_G, NIGHT_B * TINT_B);
          mm.needsUpdate = true;
        }
        o.material = Array.isArray(o.material) ? cloned : cloned[0];
      });

      grp = new THREE.Group();
      grp.name = 'loiterer30';
      grp.add(model);

      /* mixer + actions (clips named EXACTLY Idle / Walk per the w29 receipt) */
      mixer = new THREE.AnimationMixer(model);
      for (var a = 0; a < gltf.animations.length; a++) {
        var nm = gltf.animations[a].name;
        if (nm === 'Idle') idleAct = mixer.clipAction(gltf.animations[a]);
        else if (nm === 'Walk') walkAct = mixer.clipAction(gltf.animations[a]);
      }
      if (!idleAct || !walkAct) throw new Error('clips Idle/Walk missing');
      idleAct.play(); cur = idleAct; curName = 'Idle';

      grp.position.set(HOME_X, 0, HOME_Z);
      grp.rotation.y = ANCHOR_YAW;
      gasStation.add(grp);
      ready = true;
    } catch (e) { onErr(e); }
  }

  try {
    if (typeof THREE.GLTFLoader !== 'function') throw new Error('GLTFLoader missing');
    new THREE.GLTFLoader().load('assets/watchman.glb', onLoaded, undefined, onErr);
  } catch (e) { onErr(e); }

  /* ---- machine decisions ---- */
  function pickHold(lo, hi) { holdT = rand(lo, hi); }

  function startLeg() {
    /* short leg 4-8u, target clamped into the walk box; dir chosen so the target
       stays in the box (at an edge it can only go inward) */
    var x = grp.position.x;
    var dir = legDir;
    if (x <= BOX_X0 + 0.5) dir = 1;
    else if (x >= BOX_X1 - 0.5) dir = -1;
    else if (Math.random() < 0.5) dir = -dir;
    legDir = dir;
    var len = rand(LEG_LO, LEG_HI);
    legTargetX = x + dir * len;
    if (legTargetX > BOX_X1) legTargetX = BOX_X1;
    if (legTargetX < BOX_X0) legTargetX = BOX_X0;
    beginTurn(walkYaw(legDir), 'leg');
  }
  function beginTurn(toYaw, next) {
    mode = 'turn';
    turnT = 0;
    turnFrom = grp.rotation.y;
    turnTo = toYaw;
    turnNext = next;
  }
  function startHome() {
    var x = grp.position.x;
    if (Math.abs(x - HOME_X) < 0.05) { arriveHome(); return; }
    legDir = x < HOME_X ? 1 : -1;
    legTargetX = HOME_X;
    beginTurn(walkYaw(legDir), 'home');
  }
  function arriveHome() {
    mode = 'idle';
    grp.position.x = HOME_X; grp.position.z = HOME_Z;
    grp.position.x = Math.min(BOX_X1, Math.max(BOX_X0, grp.position.x));
    grp.position.z = Math.min(BOX_Z1, Math.max(BOX_Z0, grp.position.z));
    setCur('Idle');
    pickHold(IDLE_LO, IDLE_HI);
  }

  /* ---- machine tick (all writes are numbers on cached handles — zero alloc) ---- */
  function tickMachine(dt) {
    if (mode === 'idle' || mode === 'pause') {
      /* rung-4: while holding he FACES THE PLAYER (eased, clamped) */
      if (tracking) grp.rotation.y = easeYaw(grp.rotation.y, targetYaw, dt);
      holdT -= dt;
      if (holdT <= 0) {
        if (mode === 'pause') {
          if (forcePaceOverride === true || Math.random() < CHAIN_CHANCE) startLeg();
          else startHome();
        } else {
          if (forcePaceOverride === true || Math.random() < PACE_CHANCE) startLeg();
          else pickHold(IDLE_LO, IDLE_HI);
        }
      }
      return;
    }
    if (mode === 'turn') {
      turnT += dt;
      var f = Math.min(turnT / TURN_T, 1);
      f = f * f * (3 - 2 * f);                       /* smoothstep ease */
      grp.rotation.y = turnFrom + (turnTo - turnFrom) * f;
      if (turnT >= TURN_T) {
        mode = turnNext;                             /* 'leg' | 'home' */
        if (mode === 'leg' || mode === 'home') setCur('Walk');
      }
      return;
    }
    /* leg | home: translate the wrapper along local x at WALK_SPEED, hard-clamped
       to the forecourt walk box (never off the pad, into the pump band, or into
       the westbound car sweep) */
    var dir = legTargetX > grp.position.x ? 1 : -1;
    var x = grp.position.x + dir * WALK_SPEED * dt;
    var hit = dir > 0 ? x >= legTargetX : x <= legTargetX;
    if (hit) x = legTargetX;
    if (x > BOX_X1) { x = BOX_X1; hit = true; }
    if (x < BOX_X0) { x = BOX_X0; hit = true; }
    grp.position.x = x;
    if (hit) {
      if (mode === 'home') { arriveHome(); return; }
      /* leg end: stare pause — tracking owns the facing here (rung-4 read) */
      mode = 'pause';
      setCur('Idle');
      pickHold(STARE_LO, STARE_HI);
    }
  }

  /* ---- main loop: same freeze/sleep discipline as watchman.js ---- */
  var pauseov = document.getElementById('pauseov');
  var prevT = 0;

  function tick(now) {
    requestAnimationFrame(tick);
    if (!ready) return;
    if (document.hidden) { prevT = now; return; }
    if (pauseov && pauseov.style.display === 'flex') { prevT = now; return; }
    var dt = prevT ? Math.min((now - prevT) / 1000, 0.05) : 0.016;
    prevT = now;

    /* distance gate vs the camera: fog owns him past SKIP_DIST — freeze everything
       (matters on the ride-out; during title he is at dist ~0 so the mixer runs) */
    var dz = gasStation.position.z - cam.position.z;
    if (dz < NEAR_REAR || dz > SKIP_DIST) { tracking = false; return; }

    /* rung-4 tracking read: player within 70u (or rig faceNow() override) */
    if (trackOverrideT > 0) trackOverrideT -= dt;
    if (playerG) {
      var e = gasStation.position;
      var ddx = playerG.position.x - (e.x + grp.position.x);
      var ddz = playerG.position.z - (e.z + grp.position.z);
      playerDist = Math.sqrt(ddx * ddx + ddz * ddz);
    } else playerDist = -1;
    tracking = (trackOverrideT > 0) || (!!playerG && playerDist < TRACK_DIST);
    if (tracking) targetYaw = trackedYaw();

    tickMachine(dt);

    if (mixer) mixer.update(dt);
  }
  requestAnimationFrame(tick);

  /* ---- probes (HogWatchman precedent): readable headless + rig-only determinism.
     ACTUAL state() keys (rig writes against this shape, nothing phantom):
     ready, failed, clip, mode ('idle'|'pause'|'turn'|'leg'|'home'), phase
     ('hold'|'turn'|'leg'), tracking, targetYaw, yaw, anchorYaw, playerDist, dist,
     visible, world {x,y,z}, local {x,y,z}, box {x0,x1,z0,z1}, home {x,z}, scale,
     skinnedCulled, mixerTime, playerFound ---- */
  W.HogLoiterer = {
    state: function () {
      var wp = null, lz = null;
      if (grp) {
        var e = grp.matrixWorld.elements;              /* read world pos, no allocation */
        wp = { x: +e[12].toFixed(2), y: +e[13].toFixed(2), z: +e[14].toFixed(2) };
        lz = { x: +grp.position.x.toFixed(2), y: +grp.position.y.toFixed(2), z: +grp.position.z.toFixed(2) };
      }
      var dz = gasStation ? (gasStation.position.z - cam.position.z) : 0;
      return {
        ready: ready,
        failed: warned,
        clip: curName,
        mode: mode,
        phase: (mode === 'turn') ? 'turn' : (mode === 'leg' || mode === 'home') ? 'leg' : 'hold',
        tracking: tracking,
        targetYaw: +targetYaw.toFixed(3),
        yaw: grp ? +grp.rotation.y.toFixed(3) : 0,
        anchorYaw: +ANCHOR_YAW.toFixed(3),
        playerDist: playerDist === -1 ? -1 : +playerDist.toFixed(1),
        dist: +dz.toFixed(1),
        visible: !!(ready && grp && dz > NEAR_REAR && dz < SKIP_DIST),
        world: wp,
        local: lz,
        box: { x0: BOX_X0, x1: BOX_X1, z0: BOX_Z0, z1: BOX_Z1 },
        home: { x: HOME_X, z: HOME_Z },
        scale: SCALE,
        skinnedCulled: skinned ? skinned.frustumCulled : null,
        mixerTime: mixer ? +mixer.time.toFixed(3) : -1,
        playerFound: !!playerG
      };
    },
    /* rig-only deterministic handles (forcePace / setYaw precedent) */
    forcePace: function (on) {
      forcePaceOverride = on === true ? true : (on === false ? false : null);
      if (forcePaceOverride === true && (mode === 'pause' || mode === 'idle')) {
        holdT = Math.min(holdT, 0.3);              /* deterministic: leg starts inside ~0.3s */
      }
      if (forcePaceOverride === false && (mode === 'pause' || mode === 'idle')) startHome();
      return this.state();
    },
    faceNow: function () {
      /* rig-only: force the rung-4 track ease for the next 2s regardless of distance */
      trackOverrideT = 2.0;
      return this.state();
    },
    setYaw: function (y) { if (ready) { grp.rotation.y = y; return true; } return false; }
  };
})();
