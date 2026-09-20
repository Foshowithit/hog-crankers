/* HOG CRANKERS — WAVE 38 "ROADGLOW": delineator posts + cats-eye glints + wear decals.
   The road stops being an unlit slab: a staggered rhythm of near-black delineator
   posts on BOTH shoulders carries the far read, warm cats-eye glints answer ONLY
   inside the headlight throw (causal on the beam — hide the beam and the glints
   die), and soft tar-snake / patch wear decals live under the light pool.

   House pattern: js/watchman.js / js/loiterer.js / js/cook.js — own namespace
   window.HogRoadglow, silent-safe (any load/parse error = console.warn ONCE +
   dormancy, the game never notices), read-only coupling (stable player group
   locked at load, live bike re-resolved per frame), own rAF tick with document.hidden + pauseov guards + dt clamp 0.05, zero
   per-frame allocation, NO new THREE lights, pooled + recycled, DynamicDrawUsage,
   frustumCulled=false, in-place matrix rewrite, closed-ring stride recycle.

   Coupling (all read-only, resolved ONCE at load):
   - scene/camera: window.HogDebug (game.js:2157).
   - road curve: window.HogDebug.roadXAt if present, else the LOCAL replica
     roadX(z) = 11*sin(z*0.008) + 5*sin(z*0.021+1.7) (game.js:39).
   - tier: window.HogDebug.isTouch if present, else touch detect.
   - player: the player group is UNNAMED — located via the bike's userData.stand
     marker (game.js:1969), climbing to the scene child (cook.js receipt). The
     group is stable but dressPlayer() rebuilds playerBike inside it on every
     Digit/selectDiff (game.js:2071), so the live bike (the group's stand-marked
     child) is re-resolved every frame — a load-time node goes detached and its
     world transform freezes. Its .position IS the bike's world position. Beam
     heading comes from the bike object's own world quaternion (bike-local +z
     is forward: lamp z=1.05, spot targets z=22/16, pool z+1.5..+21.5 —
     game.js:1977-2151).
   - beam causality: meshes tagged userData.beamfx (cone + pool, game.js:2124/2150)
     are re-collected whenever the bike node changes (dressPlayer re-hangs the
     SAME meshes, game.js:2076); per frame their .visible chain is read. Beam hidden
     (rig cover, chase-cut onBeforeRender, whatever the cause) dims every glint
     to 25% — the glints can never outlive their light source.

   Feature A — delineator posts + cats-eye glints:
   - posts: ONE InstancedMesh BoxGeometry(0.14,0.95,0.14) Lambert 0x0d0b09
     (near-black silhouette, ART-BIBLE rule 2), y-center 0.475. Both edges at
     OFF=12.9 (off the 24-wide pavement, half-width 12), staggered half-gap:
     slot i alternates side, base z = i*12 (per-side spacing 24). Desktop 32
     (stride 384) / touch 16 (stride 192). Recycle behind camera-130, closed
     ring stride, in-place matrix rewrite, zero alloc.
   - glints: ONE THREE.Points, N verts at post x/z, y 0.88 (just under the post
     cap). 64x64 POT radial sprite, warm-white core to transparent, size ~1.1
     attenuated, additive, fog:false (far carry), depthWrite:false, vertexColors.
     Per-frame intensity = axial window (4..42 ahead, peak plateau ~10..25) x
     lateral cone gate (half-width 1.5 + 0.18*d) x beam factor (1 / 0.25).
     Peak channel target ~0.62, hard discipline <0.72 (sub-bloom: reads under
     the headlight, never blooms). Dark beyond the throw and behind: exactly 0.
   Feature B — wear decals:
   - ONE InstancedMesh PlaneGeometry(2.2,3.2) (geometry pre-rotated flat),
     MeshLambertMaterial with a 256 POT canvas: transparent bg, 2 wiggly
     tar-snakes (alpha 0.35-0.5) + 3-4 feathered patches (alpha 0.22-0.32),
     dark warm-black paint. transparent, depthWrite:false, polygonOffset -1,
     y=0.0135, renderOrder 2 (above dashes 0.01/edges 0.012, below wet 0.015
     and the light pool 4). Desktop 36 / touch 18, seeded-LCG stable layout,
     |x|<10.2 with keep-clears (dash +/-0.6, wet centers +/-1.5), stride
     480/240 closed-ring recycle.
   Budget: EXACTLY 3 new draw calls (posts + glints + decals in one group),
   zero new THREE lights, zero per-frame allocation. */

(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : globalThis;
  if (!W.HogDebug || !W.HogDebug.scene || !W.HogDebug.camera || !W.THREE) return;
  var D = W.HogDebug;
  var THREE = W.THREE;
  var scene = D.scene;
  var cam = D.camera;

  /* ---- read-only coupling, resolved ONCE ---- */
  var roadX = (typeof D.roadXAt === 'function') ? D.roadXAt :
    function (z) { return 11 * Math.sin(z * 0.008) + 5 * Math.sin(z * 0.021 + 1.7); };
  var TOUCH = (typeof D.isTouch === 'boolean') ? D.isTouch :
    (('ontouchstart' in W) || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));

  var POST_N = TOUCH ? 16 : 32;
  var POST_GAP = 12, POST_STRIDE = POST_N * POST_GAP;   /* 384 / 192 */
  var POST_OFF = 12.9;
  var DECAL_N = TOUCH ? 18 : 36;
  var DECAL_STRIDE = TOUCH ? 240 : 480;
  var RECYCLE_BEHIND = 130;

  var state = {
    ready: false, failed: false, warned: false,
    peakLuma: 0, litGlints: 0, bikeFound: false, beamOn: true,
    counts: { posts: POST_N, glints: POST_N, decals: DECAL_N }
  };

  function failOnce(msg, err) {
    state.failed = true;
    if (!state.warned) {
      state.warned = true;
      try { console.warn('[roadglow] ' + msg + ' — dormant', (err && err.message) || err); } catch (e) {}
    }
  }

  /* export EARLY so a half-built init still reports failed (never throws) */
  W.HogRoadglow = {
    state: function () {
      return {
        ready: state.ready, failed: state.failed,
        tier: TOUCH ? 'touch' : 'desktop',
        counts: { posts: POST_N, glints: POST_N, decals: DECAL_N },
        drawCalls: 3, lightsAdded: 0,
        peakLuma: +state.peakLuma.toFixed(3),
        litGlints: state.litGlints,
        bikeFound: state.bikeFound,
        beamOn: state.beamOn,
        camZ: cam ? +cam.position.z.toFixed(1) : 0
      };
    }
  };

  try {
    /* ---- locate the player group (unnamed; stand marker, cook.js receipt) ----
       The group object is STABLE (a scene child, never replaced) but the bike
       inside it is NOT: dressPlayer() removes playerBike and builds a new one
       on every Digit/selectDiff (game.js:2071). A load-time node therefore goes
       detached at the first Digit2 and its world transform freezes — the live
       bike (the group's stand-marked child) is re-resolved every frame with a
       zero-alloc scan over the group's 3 children. pack/NPC/quest bikes also
       carry userData.stand but live OUTSIDE this group, so they can never be
       picked up. */
    var bikeObj = null, playerG = null;
    scene.traverse(function (o) {
      if (bikeObj || !o.userData || !o.userData.stand) return;
      bikeObj = o;
      var top = o;
      while (top.parent && top.parent !== scene) top = top.parent;
      if (top.parent === scene) playerG = top;
    });
    if (!playerG && bikeObj) playerG = bikeObj;   /* degraded: drive off the bike node */

    /* ---- beam meshes (userData.beamfx: cone + pool) ----
       Re-collected whenever the bike node changes, so the causality read can
       never go stale with it. */
    var beamMeshes = [];
    function collectBeam() {
      beamMeshes.length = 0;
      if (bikeObj) {
        bikeObj.traverse(function (o) {
          if (o.userData && o.userData.beamfx) beamMeshes.push(o);
        });
      }
    }
    function resolveBike() {
      if (playerG && playerG.children) {
        var kids = playerG.children;
        for (var ri = 0; ri < kids.length; ri++) {
          var k = kids[ri];
          if (k.userData && k.userData.stand) {
            if (k !== bikeObj) { bikeObj = k; collectBeam(); }
            break;
          }
        }
      }
      state.bikeFound = !!bikeObj;
    }
    resolveBike();   /* initial lock; re-runs every frame in tick */
    function beamVisible() {
      if (!beamMeshes.length) return true;
      for (var b = 0; b < beamMeshes.length; b++) {
        var o = beamMeshes[b];
        while (o && o !== scene) {   /* visible chain up to the scene */
          if (!o.visible) return false;
          o = o.parent;
        }
      }
      return true;
    }

    /* ---- zero-alloc temps (module scope, reused every frame) ---- */
    var m4 = new THREE.Matrix4();
    var vP = new THREE.Vector3();
    var vOne = new THREE.Vector3(1, 1, 1);
    var vS = new THREE.Vector3();
    var qI = new THREE.Quaternion();
    var qYaw = new THREE.Quaternion();
    var quat = new THREE.Quaternion();
    var eul = new THREE.Euler();
    var AX_Y = new THREE.Vector3(0, 1, 0);

    var group = new THREE.Group();
    group.name = 'roadglow38';

    /* ================= FEATURE A: posts ================= */
    var postZ = new Array(POST_N), postX = new Array(POST_N), postSide = new Array(POST_N);
    var postMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.14, 0.95, 0.14),
      new THREE.MeshLambertMaterial({ color: 0x0d0b09 }),
      POST_N
    );
    postMesh.frustumCulled = false;
    function postMatrix(i) {
      var z = postZ[i];
      var x = roadX(z) + postSide[i] * POST_OFF;
      postX[i] = x;
      m4.compose(vP.set(x, 0.475, z), qI, vOne);
      postMesh.setMatrixAt(i, m4);
    }
    var refZ0 = cam.position.z;
    for (var pi = 0; pi < POST_N; pi++) {
      postSide[pi] = (pi % 2 === 0) ? 1 : -1;   /* staggered half-gap: alternate edges */
      postZ[pi] = pi * POST_GAP;
      while (postZ[pi] < refZ0 - RECYCLE_BEHIND) postZ[pi] += POST_STRIDE;
      postMatrix(pi);
    }
    postMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(postMesh);

    /* ================= FEATURE A: glints ================= */
    function glintSprite() {
      var c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      var g = c.getContext('2d');
      var rg = g.createRadialGradient(32, 32, 1, 32, 32, 31);
      rg.addColorStop(0.00, 'rgba(255,236,205,1)');    /* warm-white core, never pure #fff */
      rg.addColorStop(0.25, 'rgba(255,214,160,0.55)');
      rg.addColorStop(0.60, 'rgba(255,190,130,0.16)');
      rg.addColorStop(1.00, 'rgba(255,180,120,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    }
    var glintPos = new Float32Array(POST_N * 3);
    var glintCol = new Float32Array(POST_N * 3);
    var glintGeo = new THREE.BufferGeometry();
    glintGeo.setAttribute('position', new THREE.BufferAttribute(glintPos, 3));
    glintGeo.setAttribute('color', new THREE.BufferAttribute(glintCol, 3));
    glintGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    glintGeo.attributes.color.setUsage(THREE.DynamicDrawUsage);
    for (var gi = 0; gi < POST_N; gi++) {
      glintPos[gi * 3] = postX[gi];
      glintPos[gi * 3 + 1] = 0.88;
      glintPos[gi * 3 + 2] = postZ[gi];
      glintCol[gi * 3] = glintCol[gi * 3 + 1] = glintCol[gi * 3 + 2] = 0;
    }
    var glintMat = new THREE.PointsMaterial({
      size: 1.1, sizeAttenuation: true, map: glintSprite(),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      fog: false, vertexColors: true
    });
    var glints = new THREE.Points(glintGeo, glintMat);
    glints.frustumCulled = false;
    glints.renderOrder = 3;
    group.add(glints);

    /* ================= FEATURE B: wear decals ================= */
    function lcg(seed) {
      var s = seed >>> 0;
      return function () {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
      };
    }
    function decalTexture() {
      var c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      var g = c.getContext('2d');
      var rnd = lcg(38);
      g.clearRect(0, 0, 256, 256);
      var k, cx, cy, rr, rg2;
      /* 3-4 feathered patches: dark warm-black, alpha 0.22-0.32, soft edge */
      var nPatch = 3 + Math.floor(rnd() * 2);
      for (k = 0; k < nPatch; k++) {
        cx = 30 + rnd() * 196; cy = 30 + rnd() * 196; rr = 30 + rnd() * 42;
        var pa = 0.22 + rnd() * 0.10;
        rg2 = g.createRadialGradient(cx, cy, 2, cx, cy, rr);
        rg2.addColorStop(0, 'rgba(10,9,8,' + pa.toFixed(2) + ')');
        rg2.addColorStop(0.7, 'rgba(10,9,8,' + (pa * 0.45).toFixed(2) + ')');
        rg2.addColorStop(1, 'rgba(10,9,8,0)');
        g.fillStyle = rg2;
        g.beginPath(); g.arc(cx, cy, rr, 0, 6.2832); g.fill();
      }
      /* 2 wiggly tar-snakes: alpha 0.35-0.5, narrow, wandering courses */
      for (k = 0; k < 2; k++) {
        var sa = 0.35 + rnd() * 0.15;
        g.strokeStyle = 'rgba(5,4,4,' + sa.toFixed(2) + ')';
        g.lineWidth = 5 + rnd() * 3;
        g.lineCap = 'round'; g.lineJoin = 'round';
        var x = 20 + rnd() * 216, y = 8;
        g.beginPath(); g.moveTo(x, y);
        var seg;
        for (seg = 0; seg < 5; seg++) {
          var nx = Math.max(8, Math.min(248, x + (rnd() - 0.5) * 90));
          var ny = y + 40 + rnd() * 20;
          g.quadraticCurveTo(x + (rnd() - 0.5) * 60, (y + ny) / 2, nx, Math.min(ny, 250));
          x = nx; y = Math.min(ny, 250);
          if (y >= 248) break;
        }
        g.stroke();
      }
      var t = new THREE.CanvasTexture(c);
      return t;
    }
    var decalGeo = new THREE.PlaneGeometry(2.2, 3.2);
    decalGeo.rotateX(-Math.PI / 2);   /* lay flat once, at build */
    var decalMat = new THREE.MeshLambertMaterial({
      map: decalTexture(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    var decalMesh = new THREE.InstancedMesh(decalGeo, decalMat, DECAL_N);
    decalMesh.frustumCulled = false;
    decalMesh.renderOrder = 2;
    /* seeded stable layout: |x|<10.2, keep-clears dash +/-0.6 + wet centers +/-1.5
       (wet at +6.8 / 0 / -6.2, half-width 1.2). Allowed bands:
       [-10.2,-7.7] [-4.7,-1.5] [1.5,5.3] [8.3,10.2] */
    var BANDS = [[-10.2, -7.7], [-4.7, -1.5], [1.5, 5.3], [8.3, 10.2]];
    var decalZ = new Array(DECAL_N), decalX = new Array(DECAL_N);
    var decalYaw = new Array(DECAL_N), decalS = new Array(DECAL_N);
    (function () {
      var rnd = lcg(3819);
      var gap = DECAL_STRIDE / DECAL_N;
      for (var di = 0; di < DECAL_N; di++) {
        var b = BANDS[Math.floor(rnd() * BANDS.length)];
        decalX[di] = b[0] + rnd() * (b[1] - b[0]);
        decalZ[di] = di * gap;
        while (decalZ[di] < refZ0 - RECYCLE_BEHIND) decalZ[di] += DECAL_STRIDE;
        decalYaw[di] = (rnd() - 0.5) * 0.8;
        decalS[di] = 0.8 + rnd() * 0.5;
      }
    })();
    function decalMatrix(i) {
      var z = decalZ[i];
      qYaw.setFromAxisAngle(AX_Y, decalYaw[i]);
      m4.compose(vP.set(roadX(z) + decalX[i], 0.0135, z), qYaw, vS.set(decalS[i], 1, decalS[i]));
      decalMesh.setMatrixAt(i, m4);
    }
    for (var di2 = 0; di2 < DECAL_N; di2++) decalMatrix(di2);
    decalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(decalMesh);

    scene.add(group);

    /* ================= tick ================= */
    var pauseov = document.getElementById('pauseov');
    var prevT = 0;

    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function smooth(t) { t = clamp01(t); return t * t * (3 - 2 * t); }

    function tick(now) {
      requestAnimationFrame(tick);
      if (!state.ready) return;
      if (document.hidden) { prevT = now; return; }
      if (pauseov && pauseov.style.display === 'flex') { prevT = now; return; }
      var dt = prevT ? Math.min((now - prevT) / 1000, 0.05) : 0.016;
      prevT = now;
      if (dt <= 0) return;

      var camZ = cam.position.z;
      var i, z, wrapped;

      /* ---- recycle: closed rings, rewrite in place ---- */
      wrapped = false;
      for (i = 0; i < POST_N; i++) {
        z = postZ[i];
        if (z < camZ - RECYCLE_BEHIND) {
          do { z += POST_STRIDE; } while (z < camZ - RECYCLE_BEHIND);
          postZ[i] = z;
          postMatrix(i);
          glintPos[i * 3] = postX[i];
          glintPos[i * 3 + 1] = 0.88;
          glintPos[i * 3 + 2] = z;
          wrapped = true;
        }
      }
      if (wrapped) {
        postMesh.instanceMatrix.needsUpdate = true;
        glintGeo.attributes.position.needsUpdate = true;
      }
      wrapped = false;
      for (i = 0; i < DECAL_N; i++) {
        z = decalZ[i];
        if (z < camZ - RECYCLE_BEHIND) {
          do { z += DECAL_STRIDE; } while (z < camZ - RECYCLE_BEHIND);
          decalZ[i] = z;
          decalMatrix(i);
          wrapped = true;
        }
      }
      if (wrapped) decalMesh.instanceMatrix.needsUpdate = true;

      /* ---- beam frame (re-lock the live bike: dressPlayer rebuilds it) ---- */
      resolveBike();
      var bx, bz, fx, fz;
      if (bikeObj) {
        bikeObj.getWorldPosition(vP);
        bx = vP.x; bz = vP.z;
        bikeObj.getWorldQuaternion(quat);
        eul.setFromQuaternion(quat, 'YXZ');
        var yaw = eul.y;
        fx = Math.sin(yaw); fz = Math.cos(yaw);
      } else {
        bx = roadX(camZ); bz = camZ; fx = 0; fz = 1;
      }
      var beam = beamVisible();
      state.beamOn = beam;
      var beamK = beam ? 1 : 0.25;   /* causal dim: hidden beam kills the glints */

      /* ---- glint intensity: axial window x lateral cone gate x beam ---- */
      var peak = 0, lit = 0;
      for (i = 0; i < POST_N; i++) {
        var dx = postX[i] - bx;
        var dz = postZ[i] - bz;
        var d = dx * fx + dz * fz;             /* ahead distance along the beam */
        var inten = 0;
        if (d >= 4 && d <= 42) {
          var ax = smooth((d - 4) / 6) * (1 - smooth((d - 25) / 17));
          var lat = Math.abs(dx * fz - dz * fx);   /* lateral off-axis */
          var hw = 1.5 + d * 0.18;
          var g = 1 - lat / hw;
          if (g > 0) inten = ax * (g * g * (3 - 2 * g)) * beamK;
        }
        var r = 0.62 * inten, gg = 0.45 * inten, bb = 0.28 * inten;  /* warm, peak ch <0.72 */
        glintCol[i * 3] = r; glintCol[i * 3 + 1] = gg; glintCol[i * 3 + 2] = bb;
        if (r > peak) peak = r;
        if (inten > 0.05) lit++;
      }
      glintGeo.attributes.color.needsUpdate = true;
      state.peakLuma = peak;
      state.litGlints = lit;
    }

    state.ready = true;
    requestAnimationFrame(tick);
  } catch (err) {
    failOnce('init failed', err);
  }
})();
