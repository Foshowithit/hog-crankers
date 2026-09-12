/* ============================================================================
   HOG CRANKERS — NOBODY CRANKS ALONE.
   Lane 0+ playable core: ride CRANK COUNTY, CRANK HOG, answer BROTHERS IN NEED.
   Plain three.js r128. No build step. Serve the folder, brother.
   ============================================================================ */
(function () {
  'use strict';

  /* ---------------- utils ---------------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  var audio = window.HogAudio;
  var voice = window.HogVoice;   /* speech synthesis — optional, no-ops if absent */
  var IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || /forcetouch/.test(location.search);

  /* ---------------- difficulty ---------------- */
  var DIFFS = [
    { name: 'CASUAL CRANKER', warm: 1.9, climb: 3.2, perfectLo: 0.90, overGrace: 0.95, resMul: 0.8 },
    { name: 'CERTIFIED HOSS', warm: 1.5, climb: 2.4, perfectLo: 0.94, overGrace: 0.60, resMul: 1.0 },
    { name: 'ABSOLUTE MFER', warm: 1.15, climb: 1.9, perfectLo: 0.955, overGrace: 0.35, resMul: 1.25 }
  ];
  var diff = DIFFS[1];

  /* ---------------- road curve ---------------- */
  function roadX(z) { return 11 * Math.sin(z * 0.008) + 5 * Math.sin(z * 0.021 + 1.7); }
  function roadSlope(z) { return 11 * 0.008 * Math.cos(z * 0.008) + 5 * 0.021 * Math.cos(z * 0.021 + 1.7); }

  /* ---------------- three bootstrap ---------------- */
  var canvas = document.getElementById('game');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.15 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  var V = window.HogVisuals || {};

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x150b05);
  scene.fog = new THREE.FogExp2(0x150b05, 0.0036);

  var camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1600);

  var hemi = new THREE.HemisphereLight(0xffa04d, 0x0a0d05, 0.85);
  scene.add(hemi);
  var dir = new THREE.DirectionalLight(0xffb36b, 0.45);
  dir.position.set(60, 120, -80);
  scene.add(dir);

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ---------------- texture helpers ---------------- */
  function srgb(t) {
    if (t) t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function signTexture(main, sub, opt) {
    opt = opt || {};
    var c = makeCanvas(512, 256), g = c.getContext('2d');
    g.fillStyle = opt.bg || '#0d0d0d';
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = opt.border || '#d8ff00';
    g.lineWidth = 14;
    g.strokeRect(10, 10, 492, 236);
    g.fillStyle = opt.color || '#f2ead8';
    g.textAlign = 'center';
    var mainSize = opt.size || (main.length > 14 ? 56 : 76);
    g.font = mainSize + 'px Impact, "Arial Black", sans-serif';
    g.fillText(main, 256, sub ? 128 : 158, 460);
    if (sub) {
      g.fillStyle = '#d8ff00';
      g.font = '38px Impact, "Arial Black", sans-serif';
      g.fillText(sub, 256, 196, 460);
    }
    var t = srgb(new THREE.CanvasTexture(c));
    return t;
  }
  function textSprite(text, color, scale) {
    var c = makeCanvas(256, 128), g = c.getContext('2d');
    g.font = '92px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.fillStyle = color || '#d8ff00';
    g.fillText(text, 128, 100, 240);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: srgb(new THREE.CanvasTexture(c)), transparent: true, fog: true
    }));
    sp.scale.set(scale || 3, (scale || 3) * 0.5, 1);
    return sp;
  }

  /* ---------------- flaming skull moon ---------------- */
  var moon = (function () {
    var c = makeCanvas(512, 512), g = c.getContext('2d');
    var grad = g.createRadialGradient(256, 256, 40, 256, 256, 256);
    grad.addColorStop(0, 'rgba(255,190,90,0.95)');
    grad.addColorStop(0.45, 'rgba(255,122,0,0.55)');
    grad.addColorStop(1, 'rgba(255,90,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    // skull
    g.fillStyle = '#f5e9d0';
    g.beginPath(); g.ellipse(256, 250, 118, 128, 0, 0, Math.PI * 2); g.fill();      // cranium
    g.fillRect(208, 330, 96, 66);                                                   // jaw
    g.fillStyle = '#1a0c04';
    g.beginPath(); g.ellipse(214, 240, 30, 38, 0.15, 0, Math.PI * 2); g.fill();     // eyes
    g.beginPath(); g.ellipse(298, 240, 30, 38, -0.15, 0, Math.PI * 2); g.fill();
    g.fillRect(244, 288, 24, 34);                                                   // nose
    for (var i = 0; i < 5; i++) { g.fillRect(214 + i * 20, 330, 10, 60); }          // teeth gaps
    // flame licks
    g.fillStyle = 'rgba(255,140,20,0.9)';
    var flames = [[150, 150], [256, 96], [360, 148], [110, 250], [402, 248]];
    for (var f = 0; f < flames.length; f++) {
      var fx = flames[f][0], fy = flames[f][1];
      g.beginPath();
      g.moveTo(fx - 26, fy + 40);
      g.quadraticCurveTo(fx, fy - 60, fx + 26, fy + 40);
      g.closePath(); g.fill();
    }
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: srgb(new THREE.CanvasTexture(c)), transparent: true, fog: false, depthWrite: false }));
    sp.scale.set(340, 340, 1);
    scene.add(sp);
    return sp;
  })();

  /* ---------------- sky dome + stars ---------------- */
  var skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
    new THREE.MeshBasicMaterial({
      map: V.skyTexture ? srgb(V.skyTexture()) : null,
      side: THREE.BackSide, fog: false, depthWrite: false
    })
  );
  scene.add(skyDome);
  var stars = V.starField ? V.starField() : null;
  if (stars) scene.add(stars);

  /* ---------------- ground ---------------- */
  var groundTex = V.groundTexture ? V.groundTexture() : null;
  if (groundTex) {
    groundTex.repeat.set(130, 130);
    groundTex.anisotropy = 4;
  }
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshLambertMaterial({ color: 0x0e1507, map: groundTex || null })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  scene.add(ground);

  /* ---------------- road segments ---------------- */
  var SEG_LEN = 80, N_SEG = 30, WORLD_LEN = SEG_LEN * N_SEG;
  var asphaltTex = V.asphaltTexture ? V.asphaltTexture() : null;
  if (asphaltTex) {
    asphaltTex.repeat.set(2, 9);
    asphaltTex.anisotropy = 4;
  }
  var dirtTex = V.groundTexture ? V.groundTexture() : null;
  if (dirtTex) {
    dirtTex.repeat.set(5, 9);
    dirtTex.anisotropy = 4;
  }
  var roadMat = new THREE.MeshLambertMaterial({ color: 0x1b1b1e, map: asphaltTex || null });
  var dirtMat = new THREE.MeshLambertMaterial({ color: 0x171106, map: dirtTex || null });
  var lineMat = new THREE.MeshBasicMaterial({ color: 0xcfc9b0 });
  var edgeMat = new THREE.MeshBasicMaterial({ color: 0x8f8874 });

  var roadGeo = new THREE.PlaneGeometry(24, SEG_LEN);
  var dirtGeo = new THREE.PlaneGeometry(90, SEG_LEN);
  var dashGeo = new THREE.PlaneGeometry(0.22, 3.4);
  var edgeGeo = new THREE.PlaneGeometry(0.3, SEG_LEN);

  function makeSegment() {
    var grp = new THREE.Group();
    var road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    grp.add(road);
    var dirtL = new THREE.Mesh(dirtGeo, dirtMat);
    dirtL.rotation.x = -Math.PI / 2; dirtL.position.set(-56, -0.02, 0);
    grp.add(dirtL);
    var dirtR = dirtL.clone(); dirtR.position.x = 56;
    grp.add(dirtR);
    for (var d = 0; d < 8; d++) {
      var dash = new THREE.Mesh(dashGeo, lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.01, -SEG_LEN / 2 + 5 + d * 10);
      grp.add(dash);
    }
    var edgeL = new THREE.Mesh(edgeGeo, edgeMat);
    edgeL.rotation.x = -Math.PI / 2; edgeL.position.set(-11.6, 0.012, 0);
    grp.add(edgeL);
    var edgeR = edgeL.clone(); edgeR.position.x = 11.6;
    grp.add(edgeR);
    scene.add(grp);
    return grp;
  }

  var segments = [];
  for (var s = 0; s < N_SEG; s++) segments.push(makeSegment());
  function placeSegment(grp, z0) {
    var zm = z0 + SEG_LEN / 2;
    grp.position.set(roadX(zm), 0, zm);
    grp.rotation.y = Math.atan2(roadSlope(zm), 1);
    grp.userData.z0 = z0;
  }
  for (var s2 = 0; s2 < N_SEG; s2++) placeSegment(segments[s2], s2 * SEG_LEN);

  /* ---------------- corn (instanced crossed leaf planes) ---------------- */
  var CORN_N = IS_TOUCH ? 1300 : 2400;
  var cornGeo = new THREE.PlaneGeometry(2.6, 2.5);
  cornGeo.translate(0, 1.25, 0);
  var cornMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    map: V.cornTexture ? srgb(V.cornTexture()) : null,
    transparent: true, alphaTest: 0.4, side: THREE.DoubleSide
  });
  var cornMeshA = new THREE.InstancedMesh(cornGeo, cornMat, CORN_N);
  var cornMeshB = new THREE.InstancedMesh(cornGeo, cornMat, CORN_N);
  var corn = [];
  var m4 = new THREE.Matrix4();
  var m4b = new THREE.Matrix4();
  var qI = new THREE.Quaternion();
  var qY = new THREE.Quaternion();
  var rot90 = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  var vS = new THREE.Vector3();
  function cornMatrix(i) {
    var c = corn[i];
    qY.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw || 0);
    vS.set(c.s, c.s, c.s);
    m4.compose(new THREE.Vector3(roadX(c.z) + c.off, 0, c.z), qY, vS);
    m4b.copy(m4).multiply(rot90);
    cornMeshA.setMatrixAt(i, m4);
    cornMeshB.setMatrixAt(i, m4b);
  }
  for (var ci = 0; ci < CORN_N; ci++) {
    var side = Math.random() < 0.5 ? -1 : 1;
    corn.push({ z: rand(-100, WORLD_LEN - 100), off: side * rand(18, 60), s: rand(0.75, 1.5), yaw: rand(0, Math.PI) });
    cornMatrix(ci);
  }
  cornMeshA.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cornMeshB.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(cornMeshA);
  scene.add(cornMeshB);

  /* ---------------- poles (instanced) ---------------- */
  var POLE_N = 26;
  var poleMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.16, 0.22, 9, 5),
    new THREE.MeshLambertMaterial({ color: 0x2b2018 }),
    POLE_N
  );
  var poles = [];
  for (var pi = 0; pi < POLE_N; pi++) {
    poles.push({ z: pi * 110 });
  }
  function poleMatrix(i) {
    var z = poles[i].z;
    m4.compose(new THREE.Vector3(roadX(z) + 15.5, 4.5, z), qI, vS.set(1, 1, 1));
    poleMesh.setMatrixAt(i, m4);
  }
  for (var pj = 0; pj < POLE_N; pj++) poleMatrix(pj);
  poleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(poleMesh);

  /* ---------------- distant ridge silhouettes (backdrop: follows player, never recycles) ---------------- */
  function buildRidge(tall) {
    var COLS = 110, HALF = 1600;
    var p1 = rand(0, 6.28), p2 = rand(0, 6.28), p3 = rand(0, 6.28);
    var pos = new Float32Array(COLS * 2 * 3);
    var idx = [];
    for (var i = 0; i < COLS; i++) {
      var z = -HALF + (i / (COLS - 1)) * HALF * 2;
      var h = 16 + 11 * Math.sin(z * 0.004 + p1) + 8 * Math.sin(z * 0.011 + p2) + 5 * Math.sin(z * 0.027 + p3);
      h = Math.max(4, h) * (tall ? 1.18 : 1);
      pos[i * 6 + 0] = 0; pos[i * 6 + 1] = 0;     pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = 0; pos[i * 6 + 4] = h;     pos[i * 6 + 5] = z;
      if (i > 0) {
        var a = (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0d0705, side: THREE.DoubleSide }));
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }
  var ridgeL = buildRidge(true);
  var ridgeR = buildRidge(false);
  ridgeL.position.set(roadX(30) - 334, 0, 30);
  ridgeR.position.set(roadX(30) + 334, 0, 30);

  /* ---------------- roadside junk: dead cars + hay bales (instanced, recycled) ---------------- */
  var AX = new THREE.Vector3(0, 1, 0);
  var CARS_N = IS_TOUCH ? 10 : 14;
  var carBodyGeo = new THREE.BoxGeometry(4.4, 1.1, 1.9); carBodyGeo.translate(0, 0.62, 0);
  var carCabGeo = new THREE.BoxGeometry(2.3, 0.85, 1.72); carCabGeo.translate(-0.25, 1.5, 0);
  var carBodyMesh = new THREE.InstancedMesh(carBodyGeo, new THREE.MeshLambertMaterial({ color: 0x3d2a1a }), CARS_N);
  var carCabMesh = new THREE.InstancedMesh(carCabGeo, new THREE.MeshLambertMaterial({ color: 0x241a12 }), CARS_N);
  var cars = [];
  for (var cari = 0; cari < CARS_N; cari++) {
    var cside = Math.random() < 0.5 ? -1 : 1;
    cars.push({ z: rand(-100, WORLD_LEN - 100), off: cside * rand(15, 44), yaw: rand(0, Math.PI * 2) });
  }
  function carMatrix(i) {
    var c = cars[i];
    qY.setFromAxisAngle(AX, c.yaw);
    m4.compose(new THREE.Vector3(roadX(c.z) + c.off, 0, c.z), qY, vS.set(1, 1, 1));
    carBodyMesh.setMatrixAt(i, m4);
    carCabMesh.setMatrixAt(i, m4);
  }
  for (var carj = 0; carj < CARS_N; carj++) carMatrix(carj);
  carBodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  carCabMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(carBodyMesh);
  scene.add(carCabMesh);

  var BALE_N = IS_TOUCH ? 12 : 18;
  var baleGeo = new THREE.CylinderGeometry(0.85, 0.85, 1.5, 9);
  baleGeo.rotateZ(Math.PI / 2); // lying on its side
  baleGeo.translate(0, 0.85, 0);
  var baleMesh = new THREE.InstancedMesh(baleGeo, new THREE.MeshLambertMaterial({ color: 0x5c4a22 }), BALE_N);
  var bales = [];
  for (var bai = 0; bai < BALE_N; bai++) {
    var bside = Math.random() < 0.5 ? -1 : 1;
    bales.push({ z: rand(-100, WORLD_LEN - 100), off: bside * rand(15, 40), yaw: rand(0, Math.PI) });
  }
  function baleMatrix(i) {
    var b = bales[i];
    qY.setFromAxisAngle(AX, b.yaw);
    m4.compose(new THREE.Vector3(roadX(b.z) + b.off, 0, b.z), qY, vS.set(1, 1, 1));
    baleMesh.setMatrixAt(i, m4);
  }
  for (var baj = 0; baj < BALE_N; baj++) baleMatrix(baj);
  baleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(baleMesh);

  /* ---------------- gas station (spawn landmark) ---------------- */
  var gasStation = new THREE.Group();
  (function () {
    var pad = new THREE.Mesh(new THREE.BoxGeometry(26, 0.2, 20), new THREE.MeshLambertMaterial({ color: 0x191b1f }));
    pad.position.y = 0.1;
    gasStation.add(pad);
    var canopy = new THREE.Mesh(new THREE.BoxGeometry(24, 1.2, 16), new THREE.MeshLambertMaterial({ color: 0x7e2510 }));
    canopy.position.y = 7;
    gasStation.add(canopy);
    for (var px = -9; px <= 9; px += 6) {
      for (var pz = -5.5; pz <= 5.5; pz += 11) {
        var pil = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 6.4, 6), new THREE.MeshLambertMaterial({ color: 0x6e6a5e }));
        pil.position.set(px, 3.2, pz);
        gasStation.add(pil);
      }
    }
    var pump = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.6), new THREE.MeshLambertMaterial({ color: 0x8f1f0a }));
    pump.position.set(-3, 0.9, 0);
    gasStation.add(pump);
    var pump2 = pump.clone(); pump2.position.x = 3;
    gasStation.add(pump2);
    var signPost = new THREE.Mesh(new THREE.BoxGeometry(0.5, 12, 0.5), new THREE.MeshLambertMaterial({ color: 0x33302a }));
    signPost.position.set(0, 6, 11);
    gasStation.add(signPost);
    var sign = new THREE.Mesh(
      new THREE.BoxGeometry(14, 5, 0.4),
      new THREE.MeshLambertMaterial({ map: signTexture('DED HOG', 'GAS-N-GO', {}) })
    );
    sign.position.set(0, 13, 11);
    gasStation.add(sign);
  })();
  scene.add(gasStation);

  /* ---------------- billboards ---------------- */
  var BILLBOARD_LINES = [
    ['CRANK COUNTY', 'AROOO'],
    ['H.O.A. MEETING', 'TUESDAY. BEIGE.'],
    ['NOBODY CRANKS', 'ALONE.'],
    ['HOGS WELCOME', 'ALL OF THEM'],
    ['HONK IF UR A MFER', 'HELL YEAH']
  ];
  var billboards = [];
  for (var bb = 0; bb < 4; bb++) {
    var bgrp = new THREE.Group();
    var posts = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 0.6), new THREE.MeshLambertMaterial({ color: 0x2b2018 }));
    posts.position.y = 4;
    bgrp.add(posts);
    var face = new THREE.Mesh(
      new THREE.BoxGeometry(11, 6, 0.3),
      new THREE.MeshLambertMaterial({ map: signTexture(BILLBOARD_LINES[bb % BILLBOARD_LINES.length][0], BILLBOARD_LINES[bb % BILLBOARD_LINES.length][1], {}) })
    );
    face.position.y = 10;
    bgrp.add(face);
    scene.add(bgrp);
    billboards.push({ grp: bgrp, z: 420 + bb * 640 });
  }
  function placeBillboard(b) {
    var side = (Math.floor(b.z / 640) % 2 === 0) ? -1 : 1;
    b.grp.position.set(roadX(b.z) + side * 20, 0, b.z);
    b.grp.rotation.y = side < 0 ? 0.5 : -0.5;
  }
  billboards.forEach(placeBillboard);

  /* ---------------- bike factory ---------------- */
  function buildBike(opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var frameMat = new THREE.MeshLambertMaterial({ color: opts.frame || 0x7a1616 });
    var darkMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
    var chromeMat = new THREE.MeshLambertMaterial({ color: 0xc9c4b4 });

    var wheelGeo = new THREE.TorusGeometry(0.42, 0.14, 8, 16);
    var wF = new THREE.Mesh(wheelGeo, darkMat); wF.rotation.y = Math.PI / 2; wF.position.set(0, 0.55, 0.95);
    var wB = new THREE.Mesh(wheelGeo, darkMat); wB.rotation.y = Math.PI / 2; wB.position.set(0, 0.55, -0.85);
    g.add(wF); g.add(wB);
    g.userData.wheels = [wF, wB];

    var frame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 1.5), frameMat);
    frame.position.set(0, 0.75, 0);
    g.add(frame);
    // V-twin engine block with cooling fins
    var engMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
    var eng = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.5), engMat);
    eng.position.set(0, 0.62, 0.18);
    g.add(eng);
    for (var fin = 0; fin < 3; fin++) {
      var finM = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.03, 0.52), engMat);
      finM.position.set(0, 0.5 + fin * 0.09, 0.18);
      g.add(finM);
    }
    var tank = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.6), chromeMat);
    tank.position.set(0, 1.0, 0.25);
    g.add(tank);
    // tank strap + cap
    var strap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.08), darkMat);
    strap.position.set(0, 1.0, 0.25);
    g.add(strap);
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.62), darkMat);
    seat.position.set(0, 0.96, -0.42);
    g.add(seat);
    for (var f = 0; f < 2; f++) {
      var fork = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.95, 5), chromeMat);
      fork.position.set(f === 0 ? -0.16 : 0.16, 0.85, 0.85);
      fork.rotation.x = 0.42;
      g.add(fork);
    }
    var bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.85, 5), chromeMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 1.32, 0.62);
    g.add(bar);
    for (var gr = 0; gr < 2; gr++) {
      var grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 6), darkMat);
      grip.rotation.z = Math.PI / 2;
      grip.position.set(gr === 0 ? -0.42 : 0.42, 1.32, 0.62);
      g.add(grip);
    }
    // fenders arching over both wheels
    var fenderGeo = new THREE.TorusGeometry(0.56, 0.07, 6, 10, 1.7);
    var fF = new THREE.Mesh(fenderGeo, frameMat);
    fF.rotation.y = Math.PI / 2;
    fF.rotation.x = -0.35;
    fF.position.set(0, 0.55, 0.95);
    g.add(fF);
    var fR = new THREE.Mesh(fenderGeo, frameMat);
    fR.rotation.y = Math.PI / 2;
    fR.rotation.x = Math.PI + 0.42;
    fR.position.set(0, 0.55, -0.85);
    g.add(fR);
    // saddlebags flanking the rear wheel
    for (var sb = 0; sb < 2; sb++) {
      var bag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.32, 0.52), new THREE.MeshLambertMaterial({ color: 0x241a10 }));
      bag.position.set(sb === 0 ? -0.32 : 0.32, 0.78, -0.92);
      g.add(bag);
    }
    // rear plate + taillight
    var plate = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.03), new THREE.MeshLambertMaterial({ color: 0xe8e0cc }));
    plate.position.set(0, 0.85, -1.52);
    g.add(plate);
    var tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.04), new THREE.MeshBasicMaterial({ color: 0xff2418 }));
    tail.position.set(0, 0.98, -1.5);
    g.add(tail);
    g.userData.taillight = tail;
    for (var e = 0; e < 2; e++) {
      var pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 1.15, 6), chromeMat);
      pipe.rotation.x = Math.PI / 2 - 0.09;
      pipe.position.set(e === 0 ? -0.2 : 0.2, 0.62, -0.75);
      g.add(pipe);
      var flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 1.6, 7),
        new THREE.MeshBasicMaterial({ color: 0xff8c14, transparent: true, opacity: 0.95, fog: false })
      );
      flame.rotation.x = Math.PI / 2;
      flame.position.set(e === 0 ? -0.2 : 0.2, 0.55, -1.9);
      flame.visible = false;
      g.add(flame);
      if (!g.userData.flames) g.userData.flames = [];
      g.userData.flames.push(flame);
    }
    var head = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0 })
    );
    head.position.set(0, 1.05, 1.05);
    g.add(head);
    var housing = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.14, 8), chromeMat);
    housing.rotation.x = Math.PI / 2;
    housing.position.set(0, 1.05, 0.98);
    g.add(housing);
    if (opts.lights) {
      var spot = new THREE.SpotLight(0xffe0b0, 0.5, 40, 0.3, 0.6, 1.6);
      spot.position.set(0, 1.05, 1.0);
      spot.target.position.set(0, -0.4, 22);
      g.add(spot);
      g.add(spot.target);
      var spot2 = new THREE.SpotLight(0xffd9a0, 0.3, 30, 0.38, 0.75, 1.8);
      spot2.position.set(0, 0.9, 0.9);
      spot2.target.position.set(0, -0.2, 16);
      g.add(spot2);
      g.add(spot2.target);
    }
    return g;
  }

  function buildRider(opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.28, 0.75, 7),
      new THREE.MeshLambertMaterial({ color: opts.body || 0x101010 })
    );
    torso.position.set(0, 1.45, -0.25);
    g.add(torso);
    var head = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 8, 7),
      new THREE.MeshLambertMaterial({ color: opts.head || 0x0c0c0c })
    );
    head.position.set(0, 1.98, -0.2);
    g.add(head);
    if (opts.skull) {
      var jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.12), new THREE.MeshLambertMaterial({ color: 0xe8e0cc }));
      jaw.position.set(0, 1.85, -0.14);
      g.add(jaw);
    }
    for (var a = 0; a < 2; a++) {
      var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.62, 5), new THREE.MeshLambertMaterial({ color: opts.body || 0x101010 }));
      arm.position.set(a === 0 ? -0.3 : 0.3, 1.5, 0.08);
      arm.rotation.x = -0.7;
      g.add(arm);
    }
    return g;
  }

  var player = new THREE.Group();
  var playerBike = buildBike({ frame: 0x7a1616, lights: true });
  var playerRider = buildRider({});
  player.add(playerBike);
  player.add(playerRider);
  var playerLight = new THREE.PointLight(0xffc788, 0.6, 36);
  playerLight.position.set(0, 2.4, 1.2);
  player.add(playerLight);
  scene.add(player);
  window.HogDebug = { scene: scene, camera: camera };

  /* ---------------- exhaust dust particles ---------------- */
  var DUST_N = 90;
  var dustGeo = new THREE.BufferGeometry();
  var dustPos = new Float32Array(DUST_N * 3);
  for (var di = 0; di < DUST_N; di++) dustPos[di * 3 + 1] = -50;
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  var dustMat = new THREE.PointsMaterial({
    color: 0x8a6f4a, size: 0.72, transparent: true, opacity: 0.42,
    sizeAttenuation: true, depthWrite: false,
    map: V.softDotTexture ? srgb(V.softDotTexture()) : null,
    alphaTest: 0.01
  });
  var dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);
  var dustP = [];
  for (var di2 = 0; di2 < DUST_N; di2++) {
    dustP.push({ life: 0, vx: 0, vy: 0, vz: 0 });
  }
  var dustCursor = 0;
  function emitDust(x, y, z, intensity) {
    var idx = dustCursor;
    var p = dustP[idx];
    dustCursor = (dustCursor + 1) % DUST_N;
    p.life = rand(0.35, 0.8);
    p.vx = rand(-1.4, 1.4) * intensity;
    p.vy = rand(0.6, 2.2) * intensity;
    p.vz = rand(-3.5, -1.5) * intensity;
    dustPos[idx * 3] = x;
    dustPos[idx * 3 + 1] = y;
    dustPos[idx * 3 + 2] = z;
  }
  function updateDust(dt) {
    var any = false;
    for (var i = 0; i < DUST_N; i++) {
      var p = dustP[i];
      if (p.life <= 0) continue;
      any = true;
      p.life -= dt;
      p.vy -= 2.4 * dt;
      dustPos[i * 3] += p.vx * dt;
      dustPos[i * 3 + 1] += p.vy * dt;
      dustPos[i * 3 + 2] += p.vz * dt;
      if (p.life <= 0) dustPos[i * 3 + 1] = -50;
    }
    if (any) dustGeo.attributes.position.needsUpdate = true;
  }

  /* ---------------- roadside skeleton crowd pool ---------------- */
  function buildSkeleton() {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.0, 0.32), new THREE.MeshLambertMaterial({ color: 0x0d0d0d }));
    body.position.y = 0.85;
    g.add(body);
    var skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 7), new THREE.MeshLambertMaterial({ color: 0xe8e0cc }));
    skull.position.y = 1.55;
    g.add(skull);
    var arms = [];
    for (var a = 0; a < 2; a++) {
      var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.72, 5), new THREE.MeshLambertMaterial({ color: 0xe8e0cc }));
      arm.position.set(a === 0 ? -0.34 : 0.34, 1.28, 0);
      arm.rotation.z = a === 0 ? 0.9 : -0.9;
      g.add(arm);
      arms.push(arm);
    }
    g.userData.arms = arms;
    g.visible = false;
    scene.add(g);
    return g;
  }
  var skelPool = [];
  for (var sk = 0; sk < 26; sk++) skelPool.push({ g: buildSkeleton(), z: 0, active: false, jumpV: 0 });
  var skelCursor = 0;
  function spawnRoadSkeleton(pz) {
    var sk = skelPool[skelCursor]; skelCursor = (skelCursor + 1) % skelPool.length;
    var side = Math.random() < 0.5 ? -1 : 1;
    sk.z = pz + rand(30, 120);
    sk.g.position.set(roadX(sk.z) + side * rand(9, 22), 0, sk.z);
    sk.g.rotation.y = side < 0 ? 0.6 : -0.6;
    sk.g.visible = true;
    sk.active = true;
    sk.jumpV = 0;
  }

  /* ---------------- pack AI riders ---------------- */
  var FORMATION = [[-2.8, -9], [2.8, -9], [-4.8, -15], [4.8, -15], [-1.6, -21], [1.6, -21], [-6.8, -21], [6.8, -21]];
  var packRiders = [];
  function makePackRider() {
    var grp = new THREE.Group();
    grp.add(buildBike({ frame: 0x1c1c1c }));
    grp.add(buildRider({ skull: true, body: 0x141414, head: 0xe8e0cc }));
    scene.add(grp);
    return grp;
  }
  function setPackSize(n) {
    while (packRiders.length < n) packRiders.push(makePackRider());
    for (var i = 0; i < packRiders.length; i++) packRiders[i].visible = i < n;
  }
  setPackSize(0);

  /* ---------------- HOA beige crossover ---------------- */
  var hoaCar = new THREE.Group();
  (function () {
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 4.6), new THREE.MeshLambertMaterial({ color: 0xcfc4a4 }));
    body.position.y = 0.85;
    hoaCar.add(body);
    var cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 2.2), new THREE.MeshLambertMaterial({ color: 0xbfb494 }));
    cab.position.set(0, 1.75, -0.2);
    hoaCar.add(cab);
    for (var w = 0; w < 4; w++) {
      var wh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 8), new THREE.MeshLambertMaterial({ color: 0x111111 }));
      wh.rotation.z = Math.PI / 2;
      wh.position.set(w % 2 === 0 ? -1.05 : 1.05, 0.42, w < 2 ? 1.5 : -1.5);
      hoaCar.add(wh);
    }
    var signal = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffa200 })
    );
    signal.position.set(-1.02, 0.95, 2.32);
    hoaCar.add(signal);
    hoaCar.userData.signal = signal;
  })();
  hoaCar.visible = false;
  scene.add(hoaCar);
  var hoa = { active: false, z: 0, timer: 55, complained: false, blinkT: 0 };

  /* ---------------- quest state ---------------- */
  var quest = {
    active: false, state: 'none', data: null,
    brother: null, towBike: null, npc: null, rope: null,
    dest: null, destPos: 0, timer: 9, bannerTOs: []
  };
  var NPC_COLORS = [0x2f6f4f, 0x6f5a2f, 0x4f2f6f, 0x2f5a6f, 0x6f2f3a, 0x556b2f];

  function buildBrother(color) {
    var grp = new THREE.Group();
    var bike = buildBike({ frame: 0x3a3a3a });
    bike.rotation.z = 0.16;
    grp.add(bike);
    var npc = buildRider({ body: color, head: 0xd9a877 });
    npc.rotation.z = 0.1;
    grp.add(npc);
    var mark = textSprite('!', '#d8ff00', 2.2);
    mark.position.set(0, 3.4, 0);
    grp.add(mark);
    grp.userData.mark = mark;
    grp.userData.bike = bike;
    grp.userData.npc = npc;
    scene.add(grp);
    return grp;
  }

  function buildDestination(name) {
    var grp = new THREE.Group();
    var bldg = new THREE.Mesh(new THREE.BoxGeometry(20, 7, 14), new THREE.MeshLambertMaterial({ color: 0x3a2f22 }));
    bldg.position.y = 3.5;
    grp.add(bldg);
    var sign = new THREE.Mesh(
      new THREE.BoxGeometry(18, 3.2, 0.3),
      new THREE.MeshLambertMaterial({ map: signTexture(name, 'BROTHERS WELCOME', { size: 54 }) })
    );
    sign.position.set(0, 8.4, 7.2);
    grp.add(sign);
    var beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 90, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff8c14, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
    );
    beacon.position.y = 45;
    grp.add(beacon);
    scene.add(grp);
    return grp;
  }

  function clearQuestTimers() {
    for (var i = 0; i < quest.bannerTOs.length; i++) clearTimeout(quest.bannerTOs[i]);
    quest.bannerTOs = [];
  }
  function removeQuestActors() {
    if (quest.brother) { scene.remove(quest.brother); quest.brother = null; }
    if (quest.towBike) { scene.remove(quest.towBike); quest.towBike = null; }
    if (quest.dest) { scene.remove(quest.dest); quest.dest = null; }
    if (quest.rope) { scene.remove(quest.rope); quest.rope = null; }
  }

  function spawnQuest() {
    quest.data = HogQuests.next();
    quest.active = true;
    quest.state = 'seek';
    quest.brother = buildBrother(pick(NPC_COLORS));
    var bz = game.z + 175;
    quest.brother.userData.z = bz;
    quest.brother.position.set(roadX(bz) + 8.6, 0, bz);
    quest.towBike = buildBike({ frame: 0x3a3a3a });
    quest.towBike.visible = false;
    scene.add(quest.towBike);
    var ropeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    quest.rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0x35302a }));
    quest.rope.visible = false;
    scene.add(quest.rope);
    showQuestBanner(quest.data);
    if (voice) voice.event('quest', { name: quest.data.brother, distress: quest.data.distress });
    audio.stinger('quest');
    el.questbanner.style.display = 'block';
  }

  function showQuestBanner(q) {
    clearQuestTimers();
    var banner = el.questbanner, sub = el.questsub;
    banner.textContent = 'BROTHER IN NEED: ' + q.brother;
    sub.textContent = '"' + q.distress + '"';
    banner.style.display = 'block'; sub.style.display = 'block';
    quest.bannerTOs.push(setTimeout(function () {
      sub.textContent = '"' + q.clarify + '"';
    }, 2600));
    quest.bannerTOs.push(setTimeout(function () {
      banner.textContent = 'LEGENDARY QUEST STARTED: ' + q.title;
      sub.textContent = '';
      audio.stinger('quest');
    }, 5400));
    quest.bannerTOs.push(setTimeout(function () {
      banner.style.display = 'none';
      el.objective.textContent = q.objective;
      el.objective.style.display = 'block';
      el.destdist.style.display = 'block';
    }, 8600));
  }

  function completeQuest() {
    var q = quest.data;
    var reward = Math.round(q.reward * diff.resMul / 10) * 10;
    clearQuestTimers();
    el.questbanner.textContent = 'QUEST COMPLETE: ' + q.title + '  (+' + reward + ' PACK RESPECT)';
    el.questbanner.style.display = 'block';
    el.objective.style.display = 'none';
    el.destdist.style.display = 'none';
    el.questsub.style.display = 'none';
    quest.bannerTOs.push(setTimeout(function () {
      el.questbanner.style.display = 'none';
    }, 3600));
    addRespect(reward);
    audio.stinger('deliver');
    audio.howl(0.8);
    if (voice) voice.event('deliver');
    if (!ach.firstQuest) { ach.firstQuest = true; toast('HELL YEAH BROTHER', 'FIRST BROTHER DELIVERED. THE COUCH RIDES ETERNAL.'); }
    removeQuestActors();
    quest.active = false;
    quest.state = 'none';
    quest.timer = rand(11, 17);
  }

  /* ---------------- respect / tiers ---------------- */
  var TIERS = [
    [0, 'STRANGER'], [300, 'PROSPECT'], [800, 'BROTHER'], [1600, 'ROAD CAPTAIN'], [3000, 'ABSOLUTE MFER']
  ];
  var PACK_SIZES = { 0: 0, 1: 2, 2: 4, 3: 6, 4: 8 };
  var game = { respect: 0, tier: 0, z: 30, x: 4, speed: 0, steer: 0, dist: 0 };
  var ach = { firstMax: false, firstOver: false, firstQuest: false, chain5: false };

  function tierIndex(r) {
    var t = 0;
    for (var i = 0; i < TIERS.length; i++) if (r >= TIERS[i][0]) t = i;
    return t;
  }
  function addRespect(n) {
    game.respect += n;
    el.respectval.textContent = game.respect;
    var t = tierIndex(game.respect);
    if (t > game.tier) {
      game.tier = t;
      el.rankupname.textContent = TIERS[t][1];
      showOverlay('rankup', 2300);
      audio.howl(1.0);
      setPackSize(PACK_SIZES[t]);
      if (voice) voice.event('rankup', { tier: TIERS[t][1] });
      toast('HELL YEAH BROTHER', 'RANK UP: ' + TIERS[t][1]);
    }
  }

  /* ---------------- HUD helpers ---------------- */
  var el = {};
  ['loading', 'loadbar', 'title', 'hud', 'respectval', 'tierval', 'questbanner', 'questsub', 'objective', 'destdist',
    'speedval', 'meterlabel', 'meterfill', 'sweetzone', 'arooline', 'combo', 'comboval', 'toasts', 'hoaticker',
    'mutetag', 'helpline', 'rankup', 'rankupname', 'gameover', 'pauseov', 'flash'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  function showOverlay(id, ms) {
    var node = el[id];
    node.style.display = 'flex';
    if (ms) {
      setTimeout(function () { node.style.display = 'none'; }, ms);
    }
  }
  function hideOverlay(id) { el[id].style.display = 'none'; }

  function toast(label, line) {
    var t = document.createElement('div');
    t.className = 'toast';
    var l = document.createElement('span'); l.className = 'tl'; l.textContent = label;
    var b = document.createElement('span'); b.textContent = line;
    t.appendChild(l); t.appendChild(b);
    el.toasts.appendChild(t);
    while (el.toasts.children.length > 4) el.toasts.removeChild(el.toasts.firstChild);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
    }, 3400);
  }

  function arooPop() {
    var s = document.createElement('span');
    s.className = 'aropop';
    s.textContent = pick(['AROOOO', 'AROOOOO', 'HELL YEAH BROTHER', 'AROOGA', 'CRANK IT MFER', 'AROOOOOO']);
    s.style.left = (rand(12, 78)) + '%';
    s.style.top = (rand(30, 70)) + '%';
    document.getElementById('hud').appendChild(s);
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 1500);
  }

  function flashScreen(op) {
    el.flash.style.transition = 'none';
    el.flash.style.opacity = op;
    void el.flash.offsetWidth;
    el.flash.style.transition = 'opacity 0.5s ease-out';
    el.flash.style.opacity = '0';
  }

  /* ---------------- crank system ---------------- */
  var crank = { active: false, level: 0, tHold: 0, overT: 0, chain: 0, chainT: 0, boostT: 0, boostF: 1, wheelieT: 0 };
  var skelNextLevel = 0.0;
  var arooT = 0;

  function sweetZone() { return [diff.perfectLo, 1.0]; }

  function startCrank() {
    crank.active = true;
    crank.level = 0;
    crank.tHold = 0;
    crank.overT = 0;
    skelNextLevel = 0.07;
    audio.crankBegin();
    var zone = sweetZone();
    el.sweetzone.style.display = 'block';
    el.sweetzone.style.left = (zone[0] * 100) + '%';
    el.sweetzone.style.width = ((zone[1] - zone[0]) * 100) + '%';
  }

  function releaseCrank() {
    crank.active = false;
    el.sweetzone.style.display = 'none';
    var q;
    if (crank.level >= diff.perfectLo) q = 'perfect';
    else if (crank.level >= 0.85) q = 'good';
    else q = 'late';
    audio.crankRelease(q);
    if (q === 'perfect') {
      crank.chain = (crank.chainT > 0) ? crank.chain + 1 : 1;
      crank.chainT = 12;
      crank.boostT = 4.0;
      crank.boostF = 1.45;
      crank.wheelieT = 0.9;
      flashScreen('0.5');
      for (var i = 0; i < 8; i++) setTimeout(arooPop, i * 90);
      for (var s = 0; s < skelPool.length; s++) {
        if (skelPool[s].active && Math.abs(skelPool[s].z - game.z) < 90) skelPool[s].jumpV = rand(4, 7);
      }
      var gained = Math.round(25 * crank.chain * diff.resMul);
      addRespect(gained);
      if (voice) { voice.event('crankPerfect'); voice.event('maxcrank', { chain: crank.chain }); }
      toast('MAXIMUM CRANK ×' + crank.chain, '+' + gained + ' PACK RESPECT');
      el.comboval.textContent = 'MAXIMUM CRANK ×' + crank.chain;
      el.combo.style.display = 'block';
      if (crank.chain >= 5 && !ach.chain5) { ach.chain5 = true; toast('HELL YEAH BROTHER', 'CHAIN OF FIVE. THE COUNTY HEARD THAT ONE.'); }
      if (!ach.firstMax) { ach.firstMax = true; setTimeout(function () { toast('HELL YEAH BROTHER', 'FIRST MAXIMUM CRANK. THE HOG IS PLEASED.'); }, 900); }
    } else if (q === 'good') {
      crank.chain = 0;
      crank.boostT = 2.2;
      crank.boostF = 1.2;
      arooPop();
    } else {
      crank.chain = 0;
      crank.boostT = 1.0;
      crank.boostF = 1.05;
    }
    el.combo.style.display = crank.chain > 1 ? 'block' : 'none';
    crank.level = 0;
  }

  function overcrank() {
    crank.active = false;
    crank.chain = 0;
    el.combo.style.display = 'none';
    el.sweetzone.style.display = 'none';
    audio.crankOver();
    if (voice) voice.event('overcrank');
    hideOverlay('gameover');
    showOverlay('gameover');
    mode = 'overcrank';
    overT2 = 0;
    if (!ach.firstOver) { ach.firstOver = true; setTimeout(function () { toast('HELL YEAH BROTHER', 'FIRST BLOWN HOG. THE PACK IS ON THE WAY.'); }, 2400); }
  }
  var overT2 = 0;

  /* ---------------- HOA flavor ---------------- */
  var HOA_LINES = [
    'NOISE COMPLAINT FILED. THE COUNTY HAS BEEN NOTIFIED. WHATEVER.',
    'A FORM HAS BEEN SUBMITTED ABOUT YOUR JOY, BROTHER.',
    'H.O.A. NOTICE: YOUR AWESOME IS UNDER REVIEW.',
    'COMPLAINT LOGGED: "ENGINE TOO HELL YEAH".'
  ];

  /* ---------------- input ---------------- */
  var keys = {};
  var mode = 'loading';   // loading | title | ride | overcrank
  var paused = false;
  var camMode = 0;
  var muted = false;

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space') e.preventDefault();
    if (keys[e.code]) return;   // no key-repeat side effects
    keys[e.code] = true;
    if (mode === 'title') {
      if (e.code === 'Digit1') { selectDiff(0); startGame(); }
      if (e.code === 'Digit2') { selectDiff(1); startGame(); }
      if (e.code === 'Digit3') { selectDiff(2); startGame(); }
      if (e.code === 'Enter') startGame();
      return;
    }
    if (e.code === 'Space' && mode === 'ride' && !crank.active && !paused) startCrank();
    if (e.code === 'KeyM') {
      muted = HogAudio.toggleMute();
      el.mutetag.style.display = muted ? 'block' : 'none';
      if (voice) voice.setMuted(muted);
    }
    if (e.code === 'KeyP' && (mode === 'ride' || mode === 'overcrank')) togglePause();
    if (e.code === 'KeyC') camMode = (camMode + 1) % 3;
    if (e.code === 'KeyH') el.helpline.style.display = el.helpline.style.display === 'none' ? 'block' : 'none';
  });
  window.addEventListener('keyup', function (e) {
    keys[e.code] = false;
    if (e.code === 'Space' && crank.active) releaseCrank();
  });

  function togglePause() {
    paused = !paused;
    if (paused) showOverlay('pauseov'); else hideOverlay('pauseov');
  }
  window.addEventListener('blur', function () {
    if ((mode === 'ride' || mode === 'overcrank') && !paused) togglePause();
  });

  /* ---------------- title / difficulty ---------------- */
  var diffBtns = document.querySelectorAll('.diffbtn');
  for (var db = 0; db < diffBtns.length; db++) {
    diffBtns[db].addEventListener('click', function (ev) {
      selectDiff(parseInt(ev.currentTarget.getAttribute('data-diff'), 10));
      startGame();
    });
  }
  function selectDiff(i) {
    diff = DIFFS[i];
    for (var b = 0; b < diffBtns.length; b++) diffBtns[b].classList.remove('sel');
    diffBtns[i].classList.add('sel');
  }

  function startGame() {
    if (mode !== 'title') return;
    audio.init();
    audio.engineOn();
    if (voice) { voice.prime(); voice.event('start'); }
    HogQuests.reset();
    game.respect = 0; game.tier = 0;
    el.respectval.textContent = '0';
    el.tierval.textContent = TIERS[0][1];
    setPackSize(0);
    game.z = 30; game.x = roadX(30) + 6.8; game.speed = 0;
    player.position.set(game.x, 0, game.z);
    quest.active = false; quest.state = 'none'; quest.timer = 8;
    removeQuestActors();
    clearQuestTimers();
    el.questbanner.style.display = 'none';
    el.questsub.style.display = 'none';
    el.objective.style.display = 'none';
    el.destdist.style.display = 'none';
    hideOverlay('title');
    el.hud.style.display = 'block';
    mode = 'ride';
    toast('THE PACK HAS RECEIVED YOU, BROTHER', 'RIDE. ANSWER THE SIGNALS. CRANK THE HOG.');
  }

  /* ---------------- main loop ---------------- */
  var last = performance.now();
  var titleAng = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    if (paused) { renderer.render(scene, camera); return; }

    if (mode === 'title') {
      titleAng += dt * 0.35;
      player.position.set(roadX(30) + 6.8, 0, 30);
      player.rotation.y = 0;
      var cx = player.position.x + Math.sin(titleAng) * 9;
      var cz = player.position.z + Math.cos(titleAng) * 9;
      camera.position.set(cx, 2.6, cz);
      camera.lookAt(player.position.x, 1.2, player.position.z);
      moon.position.set(player.position.x + 220, 170, player.position.z + 750);
      renderer.render(scene, camera);
      return;
    }

    if (mode === 'ride' || mode === 'overcrank') updateRide(dt);
    renderer.render(scene, camera);
  }

  function updateRide(dt) {
    /* ---- input shaping ---- */
    var throttle = (keys.KeyW || keys.ArrowUp || IS_TOUCH) ? 1 : 0;   /* touch rides auto-throttle */
    var brake = (keys.KeyS || keys.ArrowDown) ? 1 : 0;
    var steerIn = ((keys.KeyA || keys.ArrowLeft) ? -1 : 0) + ((keys.KeyD || keys.ArrowRight) ? 1 : 0);

    var maxSpeed = 52 * crank.boostF;
    var onGrass = Math.abs(game.x - roadX(game.z)) > 12;
    if (onGrass) maxSpeed = Math.min(maxSpeed, 24);

    if (mode === 'overcrank') {
      game.speed = Math.max(0, game.speed - 26 * dt);
      overT2 += dt;
      if (overT2 > 3.4) {
        hideOverlay('gameover');
        mode = 'ride';
        game.speed = 30;
        audio.engineOn();
        if (voice) voice.event('respawn');
        toast('THE PACK GOT YOU RUNNING', 'GET BACK ON THAT MFER.');
      }
    } else {
      if (crank.active) {
        // cranking holds you near a crawl — commitment has a cost
        game.speed = lerp(game.speed, Math.min(game.speed, 28), 1 - Math.exp(-2.2 * dt));
        crank.tHold += dt;
        var lv;
        if (crank.tHold < diff.warm) lv = 0.6 * (crank.tHold / diff.warm);
        else lv = 0.6 + 0.4 * ((crank.tHold - diff.warm) / diff.climb);
        crank.level = clamp(lv, 0, 1);
        if (crank.level >= 1) {
          crank.overT += dt;
          if (crank.overT > diff.overGrace) overcrank();
        }
        audio.crankLevel(crank.level, crank.tHold);
        // roadside skeletons materialize with the meter
        if (crank.level >= skelNextLevel) {
          spawnRoadSkeleton(game.z);
          skelNextLevel += 0.07;
        }
        arooT += dt;
        if (crank.level > 0.55 && arooT > 0.24) { arooPop(); arooT = 0; }
        // label
        var zone = sweetZone();
        if (crank.level >= 1) { el.meterlabel.textContent = 'LET GO MFER!! LET GO!!'; el.meterlabel.classList.remove('armed'); }
        else if (crank.level >= zone[0]) { el.meterlabel.textContent = 'RELEASE, BROTHER!'; el.meterlabel.classList.add('armed'); }
        else { el.meterlabel.textContent = 'KEEP CLIMBING… HOLD…'; el.meterlabel.classList.remove('armed'); }
      } else {
        if (throttle) game.speed += 15 * dt;
        game.speed -= (brake ? 24 : 3.2) * dt;
        if (game.speed < 0) game.speed = 0;
        game.speed = Math.min(game.speed, maxSpeed);
      }
      if (crank.boostT > 0) {
        crank.boostT -= dt;
        if (crank.boostT <= 0) { crank.boostF = 1; el.combo.style.display = 'none'; }
      }
      if (crank.chainT > 0) {
        crank.chainT -= dt;
        if (crank.chainT <= 0) { crank.chain = 0; el.combo.style.display = 'none'; }
      }
      if (crank.wheelieT > 0) crank.wheelieT -= dt;
    }

    /* ---- move ---- */
    game.z += game.speed * dt;
    game.dist += game.speed * dt;
    var steerRate = 11 + game.speed * 0.16;
    game.x += steerIn * steerRate * dt;
    // grass drag
    if (onGrass && game.speed > 24) game.speed -= 18 * dt;

    player.position.set(game.x, 0, game.z);
    var slope = roadSlope(game.z);
    player.rotation.y = -Math.atan2(slope, 1) * 0.5 + steerIn * -0.06;
    playerBike.rotation.z = -steerIn * 0.42;
    playerBike.rotation.x = crank.wheelieT > 0 ? -0.38 * Math.min(1, crank.wheelieT / 0.9) : 0;

    /* wheels spin */
    var spin = game.speed * dt * 2.2;
    var wheels = playerBike.userData.wheels;
    for (var wi = 0; wi < wheels.length; wi++) wheels[wi].rotation.x += spin;

    /* flames on boost */
    var flames = playerBike.userData.flames;
    for (var fi = 0; fi < flames.length; fi++) {
      flames[fi].visible = crank.boostT > 0;
      if (flames[fi].visible) flames[fi].scale.set(1, rand(0.75, 1.35), 1);
    }

    /* exhaust dust + sky follow */
    if ((game.speed > 26 || crank.boostT > 0) && Math.random() < (crank.boostT > 0 ? 0.9 : 0.45)) {
      var emitN = crank.boostT > 0 ? 3 : 1;
      for (var em = 0; em < emitN; em++) {
        emitDust(
          game.x + rand(-0.4, 0.4), 0.45 + rand(0, 0.3), game.z - 1.7,
          crank.boostT > 0 ? 1.5 : 0.8
        );
      }
    }
    updateDust(dt);
    skyDome.position.set(game.x, 0, game.z);
    ridgeL.position.set(game.x - 334, 0, game.z);
    ridgeR.position.set(game.x + 334, 0, game.z);
    if (stars) stars.position.set(game.x, 0, game.z);

    /* ---- audio drive ---- */
    var sp01 = clamp(game.speed / 75, 0, 1);
    var rpm01 = crank.active ? (0.25 + crank.level * 0.75) : (0.12 + sp01 * 0.55 + (crank.boostT > 0 ? 0.12 : 0));
    audio.setDrive(sp01, rpm01);

    /* ---- world recycle ---- */
    for (var si = 0; si < N_SEG; si++) {
      var grp = segments[si];
      while (grp.userData.z0 + SEG_LEN < game.z - 130) placeSegment(grp, grp.userData.z0 + WORLD_LEN);
    }
    var cornDirty = false;
    for (var cj = 0; cj < CORN_N; cj++) {
      while (corn[cj].z < game.z - 130) { corn[cj].z += WORLD_LEN; cornMatrix(cj); cornDirty = true; }
    }
    if (cornDirty) {
      cornMeshA.instanceMatrix.needsUpdate = true;
      cornMeshB.instanceMatrix.needsUpdate = true;
    }
    var poleDirty = false;
    for (var pk = 0; pk < POLE_N; pk++) {
      while (poles[pk].z < game.z - 130) { poles[pk].z += POLE_N * 110; poleMatrix(pk); poleDirty = true; }
    }
    if (poleDirty) poleMesh.instanceMatrix.needsUpdate = true;
    var junkDirty = false;
    for (var cjr = 0; cjr < CARS_N; cjr++) {
      while (cars[cjr].z < game.z - 130) { cars[cjr].z += WORLD_LEN; carMatrix(cjr); junkDirty = true; }
    }
    for (var bjr = 0; bjr < BALE_N; bjr++) {
      while (bales[bjr].z < game.z - 130) { bales[bjr].z += WORLD_LEN; baleMatrix(bjr); junkDirty = true; }
    }
    if (junkDirty) {
      carBodyMesh.instanceMatrix.needsUpdate = true;
      carCabMesh.instanceMatrix.needsUpdate = true;
      baleMesh.instanceMatrix.needsUpdate = true;
    }
    for (var bi = 0; bi < billboards.length; bi++) {
      var b = billboards[bi];
      while (b.z < game.z - 130) { b.z += 4 * 640; placeBillboard(b); }
    }
    gasStation.position.set(roadX(30), 0, 30); // stays home; world slides past it

    /* ---- skeletons ---- */
    for (var si2 = 0; si2 < skelPool.length; si2++) {
      var sk = skelPool[si2];
      if (!sk.active) continue;
      if (sk.z < game.z - 40) { sk.active = false; sk.g.visible = false; continue; }
      if (sk.jumpV !== 0) {
        sk.g.position.y += sk.jumpV * dt * 4;
        sk.jumpV -= 26 * dt;
        if (sk.g.position.y <= 0) { sk.g.position.y = 0; sk.jumpV = 0; }
        var arms = sk.g.userData.arms;
        arms[0].rotation.z = 2.6; arms[1].rotation.z = -2.6;
      }
    }

    /* ---- pack riders ---- */
    for (var pr = 0; pr < packRiders.length; pr++) {
      var rider = packRiders[pr];
      if (!rider.visible) continue;
      var off = FORMATION[pr % FORMATION.length];
      var tz = game.z + off[1];
      var tx = game.x + off[0] + (roadX(tz) - roadX(game.z));
      rider.position.x = lerp(rider.position.x, tx, 1 - Math.exp(-3 * dt));
      rider.position.z = lerp(rider.position.z, tz, 1 - Math.exp(-4 * dt));
      rider.rotation.y = -Math.atan2(roadSlope(tz), 1) * 0.5;
      var rw = rider.children[0].userData.wheels;
      for (var ri = 0; ri < rw.length; ri++) rw[ri].rotation.x += spin;
    }

    /* ---- HOA crossover ---- */
    if (!hoa.active) {
      hoa.timer -= dt;
      if (hoa.timer <= 0 && mode === 'ride') {
        hoa.active = true;
        hoa.z = game.z + 340;
        hoa.complained = false;
        hoaCar.visible = true;
      }
    } else {
      hoa.z -= 17 * dt;
      var hx = roadX(hoa.z) - 5.5;
      hoaCar.position.set(hx, 0, hoa.z);
      hoaCar.rotation.y = Math.PI;
      hoa.blinkT += dt;
      hoaCar.userData.signal.visible = (hoa.blinkT % 1.2) < 0.55;
      if (!hoa.complained && crank.active && Math.abs(hoa.z - game.z) < 45) {
        hoa.complained = true;
        if (voice) voice.event('hoa');
        el.hoaticker.textContent = pick(HOA_LINES);
        el.hoaticker.style.display = 'block';
        setTimeout(function () { el.hoaticker.style.display = 'none'; }, 3800);
      }
      if (hoa.z < game.z - 80) { hoa.active = false; hoaCar.visible = false; hoa.timer = rand(70, 120); }
    }

    /* ---- quest flow ---- */
    if (mode === 'ride') {
      if (!quest.active) {
        quest.timer -= dt;
        if (quest.timer <= 0 && game.dist > 60) spawnQuest();
      } else {
        if (quest.state === 'seek') {
          var b = quest.brother;
          // recycle brother if player somehow passed him far
          while (b.userData.z < game.z - 60) b.userData.z = game.z + 150;
          b.position.z = b.userData.z;
          b.position.x = roadX(b.userData.z) + 8.6;
          b.userData.mark.position.y = 3.4 + Math.sin(performance.now() * 0.004) * 0.3;
          el.objective.textContent = 'BROTHER IN NEED AHEAD — RIDE TO ' + quest.data.brother;
          el.objective.style.display = 'block';
          var d1 = b.userData.z - game.z;
          el.destdist.textContent = Math.max(0, Math.round(d1)) + ' M TO THE BROTHER';
          el.destdist.style.display = 'block';
          if (d1 < 9 && game.speed < 42) {
            quest.state = 'tow';
            quest.towBike.visible = true;
            quest.rope.visible = true;
            quest.brother.visible = false; // he mounts his rescue bike
            audio.stinger('ui');
            if (voice) voice.event('attach');
          }
        } else if (quest.state === 'tow') {
          if (!quest.dest) {
            quest.destPos = game.z + 640;
            quest.dest = buildDestination(quest.data.destination.name);
          }
          quest.dest.position.set(roadX(quest.destPos) - 16, 0, quest.destPos);
          var tz2 = game.z - 7.2;
          var tx2 = game.x + Math.sin(performance.now() * 0.003) * 1.1 + (roadX(tz2) - roadX(game.z));
          quest.towBike.position.x = lerp(quest.towBike.position.x, tx2, 1 - Math.exp(-6 * dt));
          quest.towBike.position.z = lerp(quest.towBike.position.z, tz2, 1 - Math.exp(-8 * dt));
          quest.towBike.rotation.y = player.rotation.y;
          var pts = [new THREE.Vector3(game.x, 0.8, game.z - 1.2), new THREE.Vector3(quest.towBike.position.x, 0.8, quest.towBike.position.z + 1.2)];
          quest.rope.geometry.setFromPoints(pts);
          el.objective.textContent = quest.data.objective;
          el.destdist.textContent = Math.max(0, Math.round(quest.destPos - game.z)) + ' M TO ' + quest.data.destination.name;
          if (quest.destPos - game.z < 11 && game.speed < 30) completeQuest();
        }
      }
    }

    /* ---- HUD ---- */
    el.speedval.textContent = Math.round(game.speed * 3.6);
    el.meterfill.style.width = (crank.active ? crank.level * 100 : 0) + '%';
    el.arooline.textContent = 'AROOO METER: ' + Math.round((crank.active ? crank.level : 0) * 100) + '%';
    if (!crank.active && mode === 'ride') el.meterlabel.textContent = IS_TOUCH ? 'HOLD CRANK — CRANK THAT HOG' : 'HOLD SPACE — CRANK THAT HOG';

    /* ---- camera ---- */
    var shake = 0;
    if (crank.active) shake = crank.level * 0.34;
    if (crank.boostT > 0) shake += 0.12;
    if (onGrass) shake += 0.1;
    var shX = (Math.random() - 0.5) * shake;
    var shY = (Math.random() - 0.5) * shake;
    var camPos, lookY = 1.4;
    if (camMode === 0) camPos = [0, 3.1, -7.4];
    else if (camMode === 1) camPos = [0, 5.6, -12.5];
    else { camPos = [0, 2.0, 0.9]; lookY = 1.6; }
    var back = camPos[2], up = camPos[1], lat = camPos[0];
    camera.position.set(
      game.x + lat + shX * 0.5,
      up + shY * 0.5,
      game.z + back
    );
    camera.lookAt(game.x + shX, lookY + shY, game.z + 30);
    camera.fov = crank.boostT > 0 ? 82 : 70;
    camera.updateProjectionMatrix();

    moon.position.set(game.x + 160, 175, game.z + 800);
    ground.position.z = game.z;
  }

  /* ---------------- boot ---------------- */
  var loadPct = 2;
  el.loadbar.style.width = loadPct + '%';
  var loadTick = setInterval(function () {
    loadPct = Math.min(97, loadPct + rand(9, 22));
    el.loadbar.style.width = loadPct + '%';
  }, 200);

  Promise.all([
    document.fonts ? document.fonts.ready : Promise.resolve()
  ]).then(function () {
    setTimeout(function () {
      clearInterval(loadTick);
      el.loadbar.style.width = '100%';
      setTimeout(function () {
        el.loading.style.display = 'none';
        el.title.style.display = 'flex';
        mode = 'title';
      }, 250);
    }, 1200);
  });

  requestAnimationFrame(frame);
})();
