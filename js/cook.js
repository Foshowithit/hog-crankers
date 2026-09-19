/* HOG CRANKERS — WAVE 31 "THE COOK": the diner has a cook.
   Third living character (character-variety rung: SAME rig, new identity + placement
   + behavior). A rigged human posted on the DED HOG DINER forecourt — the game's
   biggest landmark stops being a set and gets a resident. He paces the front of the
   diner near the door, and the proven rung-4 read carries over: WITHIN ~70u HE
   NOTICES THE PLAYER (eased turn toward the bike, exp ease ~2.5/s capped 3.2 rad/s,
   clamped +/-110 deg off his post heading, 2s faceNow override).

   House pattern: js/watchman.js / js/loiterer.js — own namespace window.HogCook,
   silent-safe (any load/parse error = console.warn once + dormancy, the game never
   notices), read-only coupling to game state, zero per-frame allocation.

   Coupling (all read-only, resolved ONCE at load):
   - diner: the diner group is UNNAMED (game.js:1008) — located via its pad mesh
     (BoxGeometry 24 x 0.2 x 17, game.js:1028; the station's pad is 26/0.2/20, so the
     params are unique — same geometry-params trick as the loiterer). The diner is a
     landmarks[] entry on the LANDMARK_SPAN 6400 recycle (placeLandmark, game.js:4343),
     so childing to it moves the cook for free on every lap. Initial placement happens
     at boot (landmarks.forEach(placeLandmark), game.js:1441) — he is at the beat from
     the first title frame, no ride needed.
   - player: the player group is UNNAMED — located via playerBike's userData.stand
     marker (game.js:1969), climbing to the scene child (loiterer receipt). Its
     .position IS the bike's world position. Read per frame as two numbers.

   Identity (rung: same watchman.glb, different man): independent loader.load of the
   SAME URL (browser HTTP cache already holds it from watchman.js + loiterer.js —
   zero extra download bytes; this module parses its OWN independent instance and
   shares NO THREE objects with the other two). Scale 0.94 (~1.87m — a bigger man
   than the 1.83m keeper and the 1.75m loiterer). Materials CLONED and albedo-tinted
   UNDER the night grade: cool ivory / pale-sage — greener and lighter than the
   keeper's blue-gray, cooler than the loiterer's warm-brown (still-tuned).

   Tracking note (diner-frame math): the diner group carries yaw 0.5 (game.js:1036),
   so WORLD bearings from trackedYaw() are corrected by the diner's rotation.y before
   being compared to the LOCAL anchor yaw. The loiterer never needed this (station
   yaw 0); the watchman is never tracked. dist stays SIGNED (dinerZ - camZ): riding
   north fires the freeze via the dz < NEAR_REAR branch, not SKIP_DIST.

   Prop: a skillet childed to a hand bone (deep-find RightHand/LeftHand, watchman
   receipt) — dark Lambert disc + handle box + ONE sub-bloom warm ember halo sprite
   (fog:false additive, luma ~0.58 < 0.72 bloom line; lantern precedent, smaller at
   1.4u — coals in the pan, not a beacon). Total 4 new draw calls (budget <= 4):
   skinned mesh + 2 skillet meshes + 1 sprite. NO new THREE lights (hard rule) —
   the diner's door pool (game.js:1031) lights him.

   Perf: mixer + machine freeze beyond SKIP_DIST 360 / behind NEAR_REAR -170 (fog
   owns him). Touch tier: same cook, no IS_TOUCH split. */

(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : globalThis;
  if (!W.HogDebug || !W.HogDebug.scene || !W.THREE) return;
  var THREE = W.THREE;
  var scene = W.HogDebug.scene;
  var cam = W.HogDebug.camera;

  /* ---- locate the diner group (unnamed; find the pad mesh, climb to scene child).
     Pad geometry params 24/0.2/17 are unique (station pad 26/0.2/20). ---- */
  var diner = null;
  (function () {
    scene.traverse(function (o) {
      if (diner || !o.isMesh || !o.geometry || !o.geometry.parameters) return;
      var p = o.geometry.parameters;
      if (p.width === 24 && p.height === 0.2 && p.depth === 17) {
        var top = o;
        while (top.parent && top.parent !== scene) top = top.parent;
        if (top.parent === scene) diner = top;
      }
    });
  })();
  if (!diner) return;   /* no diner: dormant */

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
  var SCALE = 0.94;            /* model is 1.99u tall -> ~1.87m cook (keeper 1.83, loiterer 1.75) */
  var HOME_X = 3.2;            /* his spot on the forecourt (diner-local): east of the door
                                  pool (0, 3.4, -9.5), on the -z APPROACH face, on the pad
                                  edge / ground just past it */
  var HOME_Z = -10.6;          /* front wall plane is z -6 (body 18x9x12): >=4.2u clear so
                                  leg walks never clip geometry; visible ON APPROACH (-z face
                                  doctrine) riding north */
  var BOX_X0 = -4.5, BOX_X1 = 4.5;   /* pacing walk box (diner-local x), hard clamp */
  var BOX_Z0 = -11.0, BOX_Z1 = -10.2; /* pacing walk box (diner-local z), hard clamp */
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

  /* anchor: his POST heading — the diner's front (-z LOCAL, the approach face).
     Model natively faces +Z at yaw 0 (watchman receipt), so facing -z LOCAL is yaw PI.
     The diner's own yaw (0.5) is corrected for in the world-bearing tracking below. */
  var ANCHOR_YAW = Math.PI;

  /* night grade: the SAME cool moonlight multiply both residents use (one lit night),
     applied ON TOP of his own albedo tint — cool ivory / pale-sage under the grade:
     effective albedo ~(0.638, 0.699, 0.596): lighter + greener than the keeper's
     (0.585, 0.635, 0.755) blue-gray, cooler than the loiterer's (0.749, 0.572, 0.468)
     warm-brown. Tuned by still (art/w31). */
  var NIGHT_R = 0.585, NIGHT_G = 0.635, NIGHT_B = 0.755;
  var TINT_R = 1.09, TINT_G = 1.10, TINT_B = 0.79;

  /* ember pip in the skillet: warm, sub-bloom (0.2126R+0.7152G+0.0722B = 0.582 linear
     < 0.72 bloom line; watchman lantern pip 0.618 precedent) */
  var PIP_R = 1.0, PIP_G = 0.50, PIP_B = 0.16;

  /* W32 APRON: diffuse-only Lambert (emissive black, no metalness/roughness maps),
     albedo = warm apron white dimmed for night: (0.98, 0.94, 0.86) x NIGHT grade —
     TUNED BY STILL (art/w32 trail): must read white-ish at 10u, must never bloom,
     must not ghost. Start is the literal spec value; steps recorded in the report. */
  var AP_F = 1.0;                                          /* still-tuning factor */
  var APRON_R = 0.98 * AP_F * NIGHT_R, APRON_G = 0.94 * AP_F * NIGHT_G, APRON_B = 0.86 * AP_F * NIGHT_B;

  /* ---- state ---- */
  var ready = false, warned = false;
  var mixer = null, idleAct = null, walkAct = null, cur = null, curName = '';
  var grp = null, model = null, skinned = null;
  var propBone = null;
  var apronBone = null;        /* W32: spine bone the apron hangs on (null = skipped) */

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
  function normAng(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

  /* ---- ember halo texture: reuse the house soft-dot (markers28/watchman pattern) ---- */
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

  /* facing: pacing runs along LOCAL x, so the walk yaws are +/-PI/2 (rotation-safe
     under the diner's yaw — the legs translate the wrapper along diner-local x) */
  function walkYaw(dir) { return dir > 0 ? Math.PI / 2 : -Math.PI / 2; }

  /* cook world position (numbers only): diner origin + local offset rotated by the
     diner yaw. Called once per frame + by state(). */
  var cookWX = 0, cookWZ = 0;
  function worldPos() {
    var dy = diner.rotation.y, cy = Math.cos(dy), sy = Math.sin(dy);
    var lx = grp.position.x, lz = grp.position.z;
    cookWX = diner.position.x + lx * cy + lz * sy;
    cookWZ = diner.position.z - lx * sy + lz * cy;
  }

  /* tracked facing target: toward the player, clamped to the +/-110deg cone around
     his post heading so he never spins exorcist. World bearing corrected INTO the
     diner's rotated frame (diner yaw 0.5) before the anchor compare. */
  function trackedYaw() {
    var px = playerG ? playerG.position.x : cookWX + Math.sin(ANCHOR_YAW) * 10;
    var pz = playerG ? playerG.position.z : cookWZ + Math.cos(ANCHOR_YAW) * 10;
    var want = Math.atan2(px - cookWX, pz - cookWZ) - diner.rotation.y;
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
    if (!warned) { warned = true; console.warn('[cook] load failed — dormant', (err && err.message) || err); }
  }
  function onLoaded(gltf) {
    try {
      model = gltf.scene;
      model.scale.set(SCALE, SCALE, SCALE);

      /* feet on the ground: probe the bbox (load-time only), sink so min.y = 0 */
      var box = new THREE.Box3().setFromObject(model);
      model.position.y = -box.min.y;

      /* material integration: CLONE each material (this man is his own), kill the
         glTF metalness-1 clay trap, tint albedo UNDER the night grade.
         NO new lights — the diner door pool lights him. */
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
      grp.name = 'cook31';
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

      buildSkillet();
      buildApron();

      grp.position.set(HOME_X, 0, HOME_Z);
      grp.rotation.y = ANCHOR_YAW;
      diner.add(grp);
      ready = true;
    } catch (e) { onErr(e); }
  }

  /* ---- skillet: hand-bone child so it swings with the arm (receipt skeleton names:
     RightHand/LeftHand). 2 dark Lambert meshes + 1 additive ember halo = the whole
     prop (4 new draw calls total with the skinned mesh). Fallback if no hand bone:
     set down on the forecourt beside his spot. ---- */
  function buildSkillet() {
    var pan = new THREE.Group();
    pan.name = 'cookSkillet31';
    var dark = new THREE.MeshLambertMaterial({ color: 0x0b0906 });   /* moonlit doctrine: near-black */
    var disc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.075, 10), dark);
    var handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.028, 0.24), dark);
    handle.position.set(0, 0.01, 0.18);
    var ember = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTexture(), transparent: true, opacity: 0.5, depthWrite: false,
      fog: false, blending: THREE.AdditiveBlending
    }));
    ember.material.color.setRGB(1.0, 0.55, 0.2);
    ember.scale.set(1.4, 1.4, 1);        /* coals in the pan — lantern read, smaller (lantern 2.0) */
    ember.position.y = 0.06;
    pan.add(disc); pan.add(handle); pan.add(ember);
    pan.position.set(0, -0.05, 0.06);

    var hand = null;
    (function find(o) {                     /* deep-find the hand bone */
      if (hand) return;
      if (o.isBone && (o.name === 'RightHand' || o.name === 'LeftHand')) { hand = o; return; }
      for (var i = 0; i < o.children.length; i++) find(o.children[i]);
    })(model);
    if (hand) { hand.add(pan); propBone = hand.name; }
    else {
      /* documented fallback: skillet set down beside his spot on the forecourt */
      pan.position.set(HOME_X + 0.9, 0.04, HOME_Z + 0.4);
      diner.add(pan);
      propBone = 'forecourt';
    }
  }

  /* ---- W34 APRON SEAM CONTRAST (attempt-5): w33 geometry was STOPPED — two
     consecutive taste fails (punch 37). The instrumented diagnosis: relief
     EXISTS causally (bib vis-vs-hid meanAbsDiff 0.0600) but sits BELOW the
     sighted threshold — same-hue geometry under the flat night Lambert cannot
     make its own shadow (a recessed face still faces camera/light), so more
     width/depth moved nothing sighted. The lever now is CONTRAST PAINT: the
     two bib welt cords and the full waist band wear a DARK SEAM TONE
     (APRON x 0.54), so the bib breaks field -> seam -> placket -> seam ->
     field and the waist breaks with a full-width dark fold. Attempt-4
     geometry is kept (proud placket, 0.05u cords, 45mm tie shadow gap).
     MATERIAL LAW (w32, unchanged): MeshLambertMaterial, DIFFUSE-ONLY —
     emissive black, no metalness/roughness maps, albedo = apron white under
     the night grade (tuned by still). One material instance per tone, cloned
     per resident (never shared with the other two men). Tones now 2: field
     1.0 + seam 0.54 (warm ratios kept — seams read shadowed cloth, never the
     kill-list gray). The rig's 0.50 darkest/bib floor applies to FIELD
     surfaces only; the seam waiver lives in qa/w34-rig.mjs (contrast deltas,
     not absolutes). EXPECT_APRON stays 9. Fallback: NO spine bone found =
     skip the apron entirely, warn once, never throw. Bone-local axes are
     model-aligned at bind (the w31 skillet receipt: +Z model-forward, +Y up)
     — apron offsets use those axes. ---- */
  function buildApron() {
    var spine = null;
    var NAMES = ['Spine2', 'Spine1', 'Spine', 'Chest', 'spine'];
    for (var n = 0; n < NAMES.length && !spine; n++) {
      (function find(o) {
        if (spine) return;
        if (o.isBone && o.name === NAMES[n]) { spine = o; return; }
        for (var i = 0; i < o.children.length; i++) find(o.children[i]);
      })(model);
    }
    if (!spine) {
      console.warn('[cook] no Spine2/Spine1/Spine/Chest bone — apron skipped (documented fallback)');
      return;
    }
    apronBone = spine.name;
    var mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat.color.setRGB(APRON_R, APRON_G, APRON_B);
    mat.emissive.setRGB(0, 0, 0);          /* diffuse-only law, explicit */
    /* W33-ATTEMPT-4 TEETH (attempt-3 sighted: bib-vis still a flat bright
       slab — 0.03u welts ≈5px at 6u washed under night/bloom/compression,
       tone steps 0.28/0.30 clipped (plateau 0.85-0.90), and the tie face
       (+0.065) sat only ~5mm behind the skirt so the waist read
       unbroken. Three teeth, same MATERIAL LAW (cloned Lamberts, emissive
       black, no maps, one hue, now 2 tones — field + one shared shade/fold
       gain, EXPECT_APRON stays 9):
       (1) WELT CORDS widen 0.03->0.05 and stand ~11.5mm proud (face +0.144
       vs bib face +0.1325) with the fold gain deepened 0.70->0.75 — the
       sighted teeth are the WIDER cords (0.05u ≈ 8px at 6u, resolvable)
       plus the taller side walls shading dark, NOT darker paint: the rig's
       darkest/bib bar reads hex as sRGB and converts with pow(v,2.2), so
       gain g reads as ~g^2.2 and the 0.50 floor means gain must stay >=
       0.73 (0.70 reads 0.456 FAIL; 0.75 reads ~0.53 PASS with quantization
       margin). Judge ruling "same white with seam shading" holds. (2) PLACKET widens 0.09->0.11 and stands ~25.5mm
       proud (face +0.158) — taller x-normal side walls catch less frontal
       moon and read as dark seam edges flanking the bright strip; (3) TIE
       recessed to a REAL shadow gap (z -0.02->-0.06, face +0.075, 45mm
       behind the skirt face +0.12) — skirt cloth in front, air, then tie
       band, so the waist breaks bib -> fold -> skirt -> SHADOW -> band. */
    var matSeam = new THREE.MeshLambertMaterial({ color: 0xffffff });
    matSeam.color.setRGB(APRON_R * 0.54, APRON_G * 0.54, APRON_B * 0.54);
    matSeam.emissive.setRGB(0, 0, 0);    /* W34 seam tone, 0.54 gain: reads ~0.26 in the rig's
       pow(v,2.2) bar — BELOW the 0.50 floor ON PURPOSE (contrast is the lever now; attempt-4
       stayed >= 0.73 for that floor and bought nothing sighted). The floor keeps applying to
       FIELD surfaces (bib-rect median); the w34-rig waiver asserts seam CONTRAST deltas
       instead — patch-p25 gap, causal hide-seams control, waist-band dark minimum. 0.54 multiplies
       the warm apron ratios, so seams read shadowed cloth, not kill-list gray. Replaces the
       w33 shade/fold pair — 2 tones total, EXPECT_APRON 9. */
    var bib = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.62, 0.035), mat);
    bib.name = 'cookApronBib32';
    bib.position.set(0, 0.16, 0.115);      /* taller+wider: swallows the tie paint, overlaps the tie band */
    /* raised center strip, its face PROUD of the bib face by ~25.5mm: catches
       the moon rim and reads as a bright placket stripe dividing the bib;
       the taller x-normal side walls read as dark seam edges */
    var placket = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.60, 0.03), mat);
    placket.name = 'cookApronPlacket33';
    placket.position.set(0, 0.16, 0.143);
    /* flanking seam cords: attempt-4 geometry kept (0.05u ≈ 8px at 6u, ~11.5mm
       proud of the bib face) now in the DARK seam tone — the bright placket
       and field between two dark seams is the contrast compression can't eat
       (same-hue cords washed out sighted; punch 37). Same rig names
       (EXPECT_APRON 9). */
    var weltL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.60, 0.012), matSeam);
    weltL.name = 'cookApronWeltL33';
    weltL.position.set(-0.075, 0.16, 0.138);
    var weltR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.60, 0.012), matSeam);
    weltR.name = 'cookApronWeltR33';
    weltR.position.set(0.075, 0.16, 0.138);
    /* apron skirt: overlaps the bib bottom, its face recessed 12.5mm behind
       the bib face (attempt-4 step kept), now in the DARK seam tone — the
       full-width band at y~-0.15 reads as a fold with a real TONE step, so
       the column breaks field -> DARK BAND (attempt-4's same-hue skirt read
       unbroken sighted). Replaces the buried waist welt, same name. */
    var waistWelt = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.04), matSeam);
    waistWelt.name = 'cookApronWaistWelt33';
    waistWelt.position.set(0, -0.20, 0.10);
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.30, 0.03), mat);
    back.name = 'cookApronBack32';
    back.position.set(0, -0.06, -0.115);   /* the point of the wave: the BACK read */
    var tie = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.10, 0.27), mat);
    tie.name = 'cookApronTie32';
    tie.position.set(0, -0.26, -0.06);    /* W33-ATTEMPT-4 tooth (3): REAL shadow gap — face +0.075 sits
       45mm behind the skirt face (+0.12), with air between skirt cloth and band, so the waist
       breaks bib -> fold -> skirt -> SHADOW -> band (attempt-3 trap: face +0.065 sat only ~5mm
       behind the skirt and the tie face overlapped the waist read, so it read unbroken at 6u) */
    /* W35 BIB COLUMN CLEAN (cook blotch kill): the STEP-1 probe (art/w35/PROBE.md)
       raycast-verified the lower-bib-center blue-gray blotch as GLB-OWNED — base
       watchman painted-tie chest standing up to Spine-local Z 0.181 INSIDE the bib
       rect (X -0.085..+0.111, Y -0.098..+0.055), occluding the stack from the
       front-6u camera (GLB first at d 5.92, placket 5.938, bib 5.962; poke max
       23mm proud of the placket face, 48mm proud of the bib face — a chest bulge
       THROUGH the bib plane, not a hem peek). Cover-only (no tie move:
       shared-GLB paint): one FIELD-tone box, cookApronPatch35, 0.28x0.24x0.02 at
       (0,-0.01,0.195), face 0.205 — 24mm clear of the poke max with >=29mm
       lateral and >=32mm vertical overlap past the poke extremes, so the tie
       column lands behind cloth with real clearance (no 5mm near-miss). Field
       tone (same mat as the bib): tones stay 2, reads as workwear cloth.
       EXPECT_APRON 9 -> 10. Nothing else moves (seam gain 0.54, welt/placket
       geometry, waiver all untouched). */
    var patch35 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.02), mat);
    patch35.name = 'cookApronPatch35';
    patch35.position.set(0, -0.01, 0.195);
    /* bonus (spec: include if cheap and clean): two thin straps crossing on the
       back panel — the "cook, from behind" signature */
    var strapL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.48, 0.02), mat);
    strapL.name = 'cookApronStrapL32';
    strapL.position.set(0, -0.04, -0.145);
    strapL.rotation.z = 0.7;
    var strapR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.48, 0.02), mat);
    strapR.name = 'cookApronStrapR32';
    strapR.position.set(0, -0.04, -0.148);
    strapR.rotation.z = -0.7;
    spine.add(bib); spine.add(placket); spine.add(weltL); spine.add(weltR);
    spine.add(waistWelt); spine.add(back); spine.add(tie); spine.add(strapL); spine.add(strapR);
    spine.add(patch35);
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
       to the forecourt walk box (never off the approach face or into the walls —
       >=4.2u clear of the front wall plane at every point in the box) */
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

  /* ---- main loop: same freeze/sleep discipline as watchman.js / loiterer.js ---- */
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
       dist is SIGNED (dinerZ - camZ): riding north fires the freeze via the
       dz < NEAR_REAR branch once he is behind the camera, exactly like the
       watchman/loiterer. The ember halo needs no mixer time and carries the far read. */
    var dz = diner.position.z - cam.position.z;
    if (dz < NEAR_REAR || dz > SKIP_DIST) { tracking = false; return; }

    /* rung-4 tracking read: player within 70u (or rig faceNow() override) */
    if (trackOverrideT > 0) trackOverrideT -= dt;
    worldPos();
    if (playerG) {
      var ddx = playerG.position.x - cookWX;
      var ddz = playerG.position.z - cookWZ;
      playerDist = Math.sqrt(ddx * ddx + ddz * ddz);
    } else playerDist = -1;
    tracking = (trackOverrideT > 0) || (!!playerG && playerDist < TRACK_DIST);
    if (tracking) targetYaw = trackedYaw();

    tickMachine(dt);

    if (mixer) mixer.update(dt);
  }
  requestAnimationFrame(tick);

  /* ---- probes (HogLoiterer precedent — EXACT key names, plus prop/bone):
     readable headless + rig-only determinism. state() returns `.mode`, NOT `.state`.
     Keys: ready, failed, clip, mode ('idle'|'pause'|'turn'|'leg'|'home'), phase
     ('hold'|'turn'|'leg'), tracking, targetYaw, yaw, anchorYaw, playerDist, dist,
     visible, world {x,y,z}, local {x,y,z}, box {x0,x1,z0,z1}, home {x,z}, scale,
     skinnedCulled, mixerTime, playerFound, prop, bone, + W32: apronOn ---- */
  W.HogCook = {
    state: function () {
      var wp = null, lz = null;
      if (grp) {
        worldPos();
        wp = { x: +cookWX.toFixed(2), y: +diner.position.y.toFixed(2), z: +cookWZ.toFixed(2) };
        lz = { x: +grp.position.x.toFixed(2), y: +grp.position.y.toFixed(2), z: +grp.position.z.toFixed(2) };
      }
      var dz = diner ? (diner.position.z - cam.position.z) : 0;
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
        playerFound: !!playerG,
        prop: grp ? (function () { var p = null; grp.traverse(function (o) { if (!p && o.name === 'cookSkillet31') p = o; }); return p ? 'cookSkillet31' : null; })() : null,
        bone: propBone,
        apronOn: !!apronBone
      };
    },
    /* rig-only deterministic handles (forcePace / faceNow / setYaw precedent) */
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
