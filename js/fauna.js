/* HOG CRANKERS — ROADSIDE FAUNA (side-lane wave S1, branch sidelane/fauna-couch-v1)
   Crows roosting on the wave-14 telephone wires, flushing as the rider roars past.
   Pure add-on: reads window.HogDebug.{scene,camera} only — zero game.js hooks/edits.
   Perch math replicates game.js wire layout exactly: poles are an InstancedMesh
   composed at (roadX(z)+15, 0, z) scale (girth, sy, girth); wire seats at
   ATTACH_Y*sy = 10.79*sy; 3 wires at x offsets (w-1)*1.05 with 5*t*(1-t) sag.
   Pole world z is ABSOLUTE (recycle: z += POLE_STRIDE once 130 behind — verified
   game.js updateRide), so pole z compares against camera.z directly. Pole z + scale-y
   are read straight from instanceMatrix.array (translation e[12..14], scale e[5]) so
   perches follow ring recycling with no coupling to the game loop.
   Budget: perched crows = ONE merged draw call (positions rewritten in place only when
   a slot or pole changes, the wirePos pattern); flying crows = <=5 cross-plane quads
   with a 2-frame flap texture swap. No new lights, three 64px canvas textures.
   Touch tier: 7 crows / 3 flying. Freezes with the game (#pauseov), sleeps when hidden. */
(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : globalThis;
  if (!W.HogDebug || !W.HogDebug.scene || !W.THREE) return;
  var THREE = W.THREE;
  var IS_TOUCH = ('ontouchstart' in W) || (navigator.maxTouchPoints > 0) || /forcetouch/.test(location.search);

  var CROW_N = IS_TOUCH ? 7 : 12;
  var MAX_FLY = IS_TOUCH ? 3 : 5;
  var ATTACH_Y = 10.79, POLE_GAP = 60;
  var FLUSH_DIST = 42;

  /* --- find the pole InstancedMesh: count 28/14 + shaft+crossarm height ~11.2 --- */
  var scene = W.HogDebug.scene, poleMesh = null, POLE_N = 0;
  scene.traverse(function (o) {
    if (poleMesh || !o.isInstancedMesh) return;
    o.geometry.computeBoundingBox();
    var h = o.geometry.boundingBox.max.y - o.geometry.boundingBox.min.y;
    if ((o.count === 28 || o.count === 14) && h > 11 && h < 11.5) { poleMesh = o; POLE_N = o.count; }
  });
  if (!poleMesh) return;
  var POLE_STRIDE = POLE_N * POLE_GAP;
  var marr = poleMesh.instanceMatrix.array;

  function poleX(i) { return marr[i * 16 + 12]; }
  function poleZ(i) { return marr[i * 16 + 14]; }
  function poleSy(i) { return marr[i * 16 + 5]; }
  /* ring neighbor — same wrap rule as the game's ringNext() */
  function spanEnd(i) {
    var n = (i + 1) % POLE_N, z1 = poleZ(n);
    if (z1 <= poleZ(i)) z1 += POLE_STRIDE;
    return { x: poleX(n), z: z1, sy: poleSy(n) };
  }
  /* point on wire w (0..2) at param t of the span leaving pole i — mirrors writePoleSpan() */
  function wirePoint(i, w, t, out) {
    var x0 = poleX(i), z0 = poleZ(i), y0 = ATTACH_Y * poleSy(i);
    var e = spanEnd(i);
    out.x = x0 + (e.x - x0) * t + (w - 1) * 1.05;
    out.y = y0 + (e.sy * ATTACH_Y - y0) * t - 5 * t * (1 - t);
    out.z = z0 + (e.z - z0) * t;
    return out;
  }

  /* --- silhouette textures: white fill, tinted near-black by material color --- */
  function crowTex(draw) {
    var c = document.createElement('canvas'); c.width = 64; c.height = 64;
    var g = c.getContext('2d');
    draw(g);
    return new THREE.CanvasTexture(c);
  }
  function bodyAndTail(g, bodyCol, rimCol, rimEdge) {
    function shape() {
      g.beginPath();
      g.ellipse(30, 36, 13, 8.5, -0.12, 0, 6.2832);
      g.moveTo(43 + 6, 28);
      g.arc(43, 28, 6, 0, 6.2832);
      g.closePath();
    }
    g.fillStyle = bodyCol;
    shape(); g.fill();
    g.beginPath(); g.moveTo(19, 34); g.lineTo(4, 30); g.lineTo(5, 41); g.closePath(); g.fill();   /* tail */
    g.fillStyle = rimCol;
    g.beginPath(); g.moveTo(48, 27); g.lineTo(58, 30); g.lineTo(48, 31.5); g.closePath(); g.fill(); /* beak */
    if (rimEdge) {                                  /* thin ember back-edge: head+back */
      g.strokeStyle = rimEdge; g.lineWidth = 2.2; g.lineCap = 'round';
      g.beginPath(); g.arc(43, 28, 7.1, -2.4, 0.5); g.stroke();
      g.beginPath(); g.moveTo(40, 30); g.quadraticCurveTo(28, 26, 18, 32); g.stroke();
    }
  }
  var texPerch = crowTex(function (g) {  /* side view, wings folded, legs to the wire */
    bodyAndTail(g, '#3f3020', '#7a5430', 'rgba(200,122,48,0.9)');
    g.strokeStyle = '#1a140c'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(28, 44); g.lineTo(27, 53); g.moveTo(34, 44); g.lineTo(34, 53); g.stroke();
  });
  var texUp = crowTex(function (g) {     /* wings raised — dark phase of the flap */
    bodyAndTail(g, '#3a2c1d', '#7a5430', 'rgba(190,115,45,0.75)');
    g.fillStyle = '#332616';
    g.beginPath(); g.moveTo(28, 33); g.quadraticCurveTo(20, 18, 8, 10); g.lineTo(14, 26); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(32, 33); g.quadraticCurveTo(42, 18, 54, 10); g.lineTo(48, 26); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(176,106,42,0.55)'; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(27, 32); g.quadraticCurveTo(19, 18, 9, 11); g.stroke();
    g.beginPath(); g.moveTo(33, 32); g.quadraticCurveTo(41, 18, 51, 11); g.stroke();
  });
  var texDown = crowTex(function (g) {   /* wings driven down — bright trailing edge flashes */
    bodyAndTail(g, '#332617', '#7a5430', 'rgba(200,122,48,0.95)');
    g.fillStyle = '#3d2e1b';
    g.beginPath(); g.moveTo(28, 38); g.quadraticCurveTo(16, 44, 6, 54); g.lineTo(20, 48); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(32, 38); g.quadraticCurveTo(44, 44, 54, 54); g.lineTo(40, 48); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(200,122,48,0.9)'; g.lineWidth = 2.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(27, 39); g.quadraticCurveTo(16, 45, 7, 53); g.stroke();
    g.beginPath(); g.moveTo(33, 39); g.quadraticCurveTo(44, 45, 53, 53); g.stroke();
  });

  function perchMat(map) {
    return new THREE.MeshBasicMaterial({ map: map, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  }
  var flyMat = perchMat;

  /* quad vertex order used everywhere below: bl, br, tr | bl, tr, tl */
  var QUAD_UV = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];

  /* --- perched pool: ONE merged non-indexed geometry, 2 crossed quads per crow --- */
  var PERCH_W = 0.85, PERCH_H = 0.92;
  var perchPos = new Float32Array(CROW_N * 12 * 3);
  var perchUV = new Float32Array(CROW_N * 12 * 2);
  (function () {
    for (var q = 0; q < CROW_N; q++) {
      perchUV.set(QUAD_UV, q * 24);
      perchUV.set(QUAD_UV, q * 24 + 12);
    }
  })();
  var perchGeo = new THREE.BufferGeometry();
  perchGeo.setAttribute('position', new THREE.BufferAttribute(perchPos, 3));
  perchGeo.setAttribute('uv', new THREE.BufferAttribute(perchUV, 2));
  var perchMesh = new THREE.Mesh(perchGeo, perchMat(texPerch));
  perchMesh.frustumCulled = false;
  scene.add(perchMesh);

  function writeCross(arr, base, cx, cy, cz, hw, hh) {
    var qa = [cx, cy - hh, cz - hw, cx, cy - hh, cz + hw, cx, cy + hh, cz + hw,
              cx, cy - hh, cz - hw, cx, cy + hh, cz + hw, cx, cy + hh, cz - hw];
    var qb = [cx - hw, cy - hh, cz, cx + hw, cy - hh, cz, cx + hw, cy + hh, cz,
              cx - hw, cy - hh, cz, cx + hw, cy + hh, cz, cx - hw, cy + hh, cz];
    var i;
    for (i = 0; i < 18; i++) arr[base + i] = qa[i];
    for (i = 0; i < 18; i++) arr[base + 18 + i] = qb[i];
  }

  /* --- slots --- */
  var slots = [], tmpV = { x: 0, y: 0, z: 0 };
  for (var si = 0; si < CROW_N; si++) {
    slots.push({ state: 'empty', span: -1, wire: 0, t: 0, px: 0, py: 0, pz: 0, timer: 0, dirty: false, idx: si, idleT: 2 + Math.random() * 6, hopT: 0 });
  }
  function countOnSpan(span) {
    var n = 0;
    for (var i = 0; i < CROW_N; i++) if (slots[i].state === 'perch' && slots[i].span === span) n++;
    return n;
  }
  function spawnAhead(slot, camZ, band) {
    var lo = band ? band[0] : 70, hi = band ? band[1] : 430, cands = [];
    for (var i = 0; i < POLE_N; i++) {
      var dz = poleZ(i) - camZ;
      if (dz > lo && dz < hi && countOnSpan(i) < 2) cands.push(i);
    }
    if (!cands.length) { slot.timer = 3 + Math.random() * 5; return false; }
    slot.span = cands[(Math.random() * cands.length) | 0];
    slot.wire = (Math.random() * 3) | 0;
    slot.t = 0.15 + Math.random() * 0.7;
    slot.state = 'perch';
    slot.dirty = true;
    return true;
  }
  function perchCenter(s, out) {
    out.x = s.px; out.y = s.py + PERCH_H * 0.52; out.z = s.pz;
    return out;
  }
  function rewriteSlot(s) {
    perchCenter(s, tmpV);
    writeCross(perchPos, s.idx * 36, tmpV.x, tmpV.y, tmpV.z, PERCH_W * 0.5, PERCH_H * 0.5);
  }

  /* --- flying crows --- */
  var fliers = [];
  function makeFlier() {
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
    var uv = new Float32Array(12 * 2);
    uv.set(QUAD_UV, 0); uv.set(QUAD_UV, 12);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    var mat = flyMat(texUp);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.visible = false;
    scene.add(mesh);
    return { mesh: mesh, mat: mat, vel: { x: 0, y: 0, z: 0 }, t: 0, flapT: 0, up: true };
  }
  function flush(slot) {
    var f = null, i;
    for (i = 0; i < fliers.length; i++) if (!fliers[i].mesh.visible) { f = fliers[i]; break; }
    if (!f && fliers.length < MAX_FLY) { f = makeFlier(); fliers.push(f); }
    if (!f) { slot.state = 'empty'; slot.timer = 2 + Math.random() * 4; return; }
    perchCenter(slot, tmpV);
    f.mesh.position.set(tmpV.x, tmpV.y, tmpV.z);
    f.vel.x = (Math.random() < 0.5 ? -1 : 1) * (2.5 + Math.random() * 3.5);   /* panic scatter both ways */
    f.vel.y = 7 + Math.random() * 3;              /* climb for the moon line — contrast lives up there */
    f.vel.z = 2 + Math.random() * 6;              /* carry forward across the road */
    f.t = 0; f.flapT = Math.random() * 0.11; f.up = Math.random() < 0.5;
    f.mat.map = f.up ? texUp : texDown;
    writeCross(f.mesh.geometry.attributes.position.array, 0, tmpV.x, tmpV.y, tmpV.z, 0.7, 0.4);
    f.mesh.geometry.attributes.position.needsUpdate = true;
    f.mesh.visible = true;
    slot.state = 'empty'; slot.timer = 4 + Math.random() * 8;
  }

  /* high cruise: 1-3 birds crossing the road at moon altitude every ~20-35s — the
     oncoming-flight shot. The moon sits ahead-above the road line, so birds gaining
     altitude ahead of the rider cross its disc and read at full contrast. */
  var cruiseT = 6;
  function spawnCruise() {
    var f = null, i;
    for (i = 0; i < fliers.length; i++) if (!fliers[i].mesh.visible) { f = fliers[i]; break; }
    if (!f && fliers.length < MAX_FLY + 2) { f = makeFlier(); fliers.push(f); }
    if (!f) return;
    f.mesh.visible = true;
    f.mesh.position.set(cam.position.x + (Math.random() * 2 - 1) * 34,
                        22 + Math.random() * 16,
                        cam.position.z + 130 + Math.random() * 110);
    var side = Math.random() < 0.5 ? -1 : 1;
    f.vel.x = side * (4 + Math.random() * 5);     /* cross the road laterally */
    f.vel.y = Math.random() * 2;
    f.vel.z = -(3 + Math.random() * 5);           /* drift toward the rider, longer on screen */
    f.t = 0; f.flapT = Math.random() * 0.11; f.up = Math.random() < 0.5;
    f.mat.map = f.up ? texUp : texDown;
    writeCross(f.mesh.geometry.attributes.position.array, 0,
      f.mesh.position.x, f.mesh.position.y, f.mesh.position.z, 0.7, 0.4);
    f.mesh.geometry.attributes.position.needsUpdate = true;
  }

  /* --- main loop --- */
  var cam = W.HogDebug.camera;
  var pauseov = document.getElementById('pauseov');
  var lastPoleZ = null, prevT = 0;

  function tick(now) {
    requestAnimationFrame(tick);
    if (document.hidden) return;
    if (pauseov && pauseov.style.display === 'flex') { prevT = now; return; }   /* frozen with the game */
    var d = prevT ? Math.min((now - prevT) / 1000, 0.05) : 0.016;
    prevT = now;

    /* pole recycle detection: any pole translation-z change dirties every perch */
    var recycled = false;
    if (lastPoleZ) {
      for (var i = 0; i < POLE_N; i++) {
        if (lastPoleZ[i] !== poleZ(i)) { recycled = true; break; }
      }
    } else {
      lastPoleZ = new Float32Array(POLE_N);
    }
    for (var z = 0; z < POLE_N; z++) lastPoleZ[z] = poleZ(z);
    if (recycled) for (var r = 0; r < CROW_N; r++) if (slots[r].state === 'perch') slots[r].dirty = true;

    var cx = cam.position.x, cz = cam.position.z, anyDirty = false;

    cruiseT -= d;
    if (cruiseT <= 0) { spawnCruise(); cruiseT = 18 + Math.random() * 17; }

    for (var j = 0; j < CROW_N; j++) {
      var sl = slots[j];
      if (sl.state === 'empty') {
        sl.timer -= d;
        if (sl.timer <= 0) spawnAhead(sl, cz);
        continue;
      }
      /* perch: follow the (rarely moving) wire point, flush when the rider closes in */
      wirePoint(sl.span, sl.wire, sl.t, tmpV);
      var hop = 0;
      sl.idleT -= d;
      if (sl.idleT <= 0 && sl.hopT <= 0) { sl.hopT = 0.26; sl.idleT = 3 + Math.random() * 6; }
      if (sl.hopT > 0) { sl.hopT -= d; hop = Math.sin(Math.PI * Math.max(sl.hopT, 0) / 0.26) * 0.15; if (sl.hopT <= 0) anyDirty = true; }
      if (tmpV.x !== sl.px || tmpV.y !== sl.py || tmpV.z !== sl.pz || sl.dirty) {
        sl.px = tmpV.x; sl.py = tmpV.y; sl.pz = tmpV.z;
        sl.dirty = true;
      }
      if (sl.dirty || hop > 0) {
        writeCross(perchPos, sl.idx * 36, sl.px, sl.py + PERCH_H * 0.52 + hop, sl.pz, PERCH_W * 0.5, PERCH_H * 0.5);
        sl.dirty = false;
        anyDirty = true;
      }
      var dx = sl.px - cx, dz = sl.pz - cz;
      if (dx * dx + dz * dz < FLUSH_DIST * FLUSH_DIST) { flush(sl); anyDirty = true; }
    }
    if (anyDirty) {
      /* collapse unassigned slots to degenerate quads so stale silhouettes never show */
      for (var e = 0; e < CROW_N; e++) {
        if (slots[e].state !== 'perch') {
          var b = e * 36;
          for (var q = 0; q < 36; q++) perchPos[b + q] = 0;
        }
      }
      perchGeo.attributes.position.needsUpdate = true;
    }

    for (var fi = 0; fi < fliers.length; fi++) {
      var f = fliers[fi];
      if (!f.mesh.visible) continue;
      f.vel.y = Math.max(f.vel.y - 2.1 * d, -1.2);
      f.mesh.position.x += f.vel.x * d;
      f.mesh.position.y += f.vel.y * d;
      f.mesh.position.z += f.vel.z * d;
      f.t += d; f.flapT += d;
      if (f.flapT > 0.11) { f.flapT = 0; f.up = !f.up; f.mat.map = f.up ? texUp : texDown; }
      writeCross(f.mesh.geometry.attributes.position.array, 0,
        f.mesh.position.x, f.mesh.position.y, f.mesh.position.z, 0.58, 0.34);
      f.mesh.geometry.attributes.position.needsUpdate = true;
      var fdx = f.mesh.position.x - cx, fdz = f.mesh.position.z - cz;
      if (f.t > 15 || f.mesh.position.z < cz - 40 || (fdx * fdx + fdz * fdz) > 520 * 520) f.mesh.visible = false;
    }
  }

  /* deterministic-evidence hooks (the HogWeather.force pattern) */
  W.HogFauna = {
    state: function () {
      var out = { touch: IS_TOUCH, stride: POLE_STRIDE, perched: 0, flying: 0, slots: [] };
      for (var i = 0; i < CROW_N; i++) {
        var s = slots[i];
        if (s.state === 'perch') out.perched++;
        out.slots.push({ state: s.state, span: s.span, wire: s.wire, z: Math.round(s.pz), x: +s.px.toFixed(1), y: +s.py.toFixed(1) });
      }
      for (var f = 0; f < fliers.length; f++) {
        if (!fliers[f].mesh.visible) continue;
        out.flying++;
        out.pos = out.pos || [];
        out.pos.push({ x: +fliers[f].mesh.position.x.toFixed(1), y: +fliers[f].mesh.position.y.toFixed(1), z: +fliers[f].mesh.position.z.toFixed(1) });
      }
      return out;
    },
    flushAll: function () {
      var n = 0;
      for (var i = 0; i < CROW_N; i++) if (slots[i].state === 'perch') { flush(slots[i]); n++; }
      return n;
    },
    spawnAhead: function () {
      var n = 0;
      for (var i = 0; i < CROW_N; i++) if (slots[i].state === 'empty' && spawnAhead(slots[i], cam.position.z)) n++;
      return n;
    }
  };

  /* initial fill: staggered down the road so every ride has roosts waiting */
  for (var k = 0; k < CROW_N; k++) {
    spawnAhead(slots[k], cam.position.z, [80 + k * 105, 80 + k * 105 + 90]);
  }
  /* paint initial perches immediately */
  for (var p = 0; p < CROW_N; p++) {
    if (slots[p].state === 'perch') {
      wirePoint(slots[p].span, slots[p].wire, slots[p].t, tmpV);
      slots[p].px = tmpV.x; slots[p].py = tmpV.y; slots[p].pz = tmpV.z;
      rewriteSlot(slots[p]);
      slots[p].dirty = false;
    }
  }
  perchGeo.attributes.position.needsUpdate = true;
  requestAnimationFrame(tick);
})();
