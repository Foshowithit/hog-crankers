/* ==========================================================================
   HOG CRANKERS — visuals.js
   Canvas-generated texture factories for the NIGHT RIDE. Zero image files,
   zero network: every pixel is drawn to <canvas> at runtime.
   Plain script (ES2019), no modules. Attaches ONE global: window.HogVisuals
     - HogVisuals.skyTexture()     -> THREE.CanvasTexture (sky dome gradient)
     - HogVisuals.groundTexture()  -> THREE.CanvasTexture (RepeatWrapping, repeat left at 1,1)
     - HogVisuals.asphaltTexture() -> THREE.CanvasTexture (RepeatWrapping, repeat left at 1,1)
     - HogVisuals.cornTexture()    -> THREE.CanvasTexture (transparent stalk for crossed planes)
     - HogVisuals.starField()      -> THREE.Points (~900 stars, upper hemisphere)
   THREE is only referenced INSIDE the factories, so load order vs three.min.js
   does not matter.
   ========================================================================== */
(function () {
  'use strict';

  var HogVisuals = (typeof window !== 'undefined') ? (window.HogVisuals = {}) : {};

  /* ---------------- tiny helpers ---------------- */
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function mkCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* scatter n small rects of random colors/alpha — cheap dither/speckle */
  function speckle(ctx, w, h, n, colors, aMin, aMax, sMax) {
    for (var i = 0; i < n; i++) {
      ctx.globalAlpha = rand(aMin, aMax);
      ctx.fillStyle = pick(colors);
      ctx.fillRect(rand(0, w), rand(0, h), rand(1, sMax), rand(1, sMax));
    }
    ctx.globalAlpha = 1;
  }

  /* wandering thin polyline used for dirt/asphalt cracks */
  function crack(ctx, x, y, len, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    var steps = 4 + (Math.random() * 4) | 0;
    for (var i = 0; i < steps; i++) {
      x += rand(-14, 14); y += rand(-14, 14);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /* ---------------- 1. sky dome gradient ---------------- */
  HogVisuals.skyTexture = function () {
    var c = mkCanvas(512, 512), ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0.00, '#0d0508'); // deep black-maroon zenith
    g.addColorStop(0.45, '#1c0a06'); // dark blood-red
    g.addColorStop(0.75, '#3a1608'); // burnt orange
    g.addColorStop(1.00, '#6b2a0c'); // hot amber horizon glow
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    // banding-free dithering: semi-transparent noise pixels in matching hues
    speckle(ctx, 512, 512, 700, ['#000000', '#6b2a0c', '#3a1608', '#1c0a06'], 0.02, 0.07, 2);
    return new THREE.CanvasTexture(c);
  };

  /* ---------------- 2. dry dirt ground ---------------- */
  HogVisuals.groundTexture = function () {
    var c = mkCanvas(512, 512), ctx = c.getContext('2d');
    ctx.fillStyle = '#241a10';
    ctx.fillRect(0, 0, 512, 512);
    // soil patches
    for (var i = 0; i < 46; i++) {
      ctx.globalAlpha = rand(0.08, 0.25);
      ctx.fillStyle = pick(['#1a120a', '#2e2318']);
      ctx.beginPath();
      ctx.ellipse(rand(0, 512), rand(0, 512), rand(14, 60), rand(10, 40), rand(0, 3.1), 0, 6.29);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // dry-grass streaks (faint dead sage)
    ctx.strokeStyle = '#33402a';
    for (var s = 0; s < 70; s++) {
      ctx.globalAlpha = rand(0.10, 0.3);
      ctx.lineWidth = rand(1, 2.5);
      var x = rand(0, 512), y = rand(0, 512), a = rand(-0.5, 0.5), l = rand(12, 46);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    speckle(ctx, 512, 512, 550, ['#1a120a', '#2e2318', '#0f0b06', '#332a1c'], 0.15, 0.5, 3);
    // a few subtle cracks
    for (var k = 0; k < 4; k++) crack(ctx, rand(0, 512), rand(0, 512), 0, '#120c06', 1.2);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t; // repeat left at (1,1) — caller sets it
  };

  /* ---------------- 3. night highway asphalt ---------------- */
  HogVisuals.asphaltTexture = function () {
    var c = mkCanvas(512, 512), ctx = c.getContext('2d');
    ctx.fillStyle = '#1e1d21';
    ctx.fillRect(0, 0, 512, 512);
    // lighter aggregate patch + fine grey speckle noise
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#2a282c';
    ctx.fillRect(rand(0, 380), rand(0, 380), rand(90, 160), rand(70, 140));
    ctx.globalAlpha = 1;
    speckle(ctx, 512, 512, 1400, ['#33323a', '#17161a', '#4a4952', '#101013', '#26252b'], 0.10, 0.45, 2);
    // faint tire-wear darker bands (vertical, tile-friendly at edges)
    for (var b = 0; b < 2; b++) {
      var bx = pick([70, 170, 340, 430]) + rand(-10, 10);
      var bg = ctx.createLinearGradient(bx - 34, 0, bx + 34, 0);
      bg.addColorStop(0, 'rgba(14,13,16,0)');
      bg.addColorStop(0.5, 'rgba(14,13,16,0.28)');
      bg.addColorStop(1, 'rgba(14,13,16,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(bx - 34, 0, 68, 512);
    }
    // one or two subtle cracks
    crack(ctx, rand(40, 470), rand(0, 512), 0, '#121116', 1);
    if (Math.random() < 0.6) crack(ctx, rand(40, 470), rand(0, 512), 0, '#121116', 1);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t; // repeat left at (1,1) — caller sets it
  };

  /* ---------------- 4. corn stalk (transparent, crossed planes) ---------------- */
  HogVisuals.cornTexture = function () {
    var W = 128, H = 256;
    var c = mkCanvas(W, H), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    var cx = W / 2;
    // thin vertical stalk
    ctx.strokeStyle = '#4a6b2a';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, H - 2);
    ctx.quadraticCurveTo(cx + rand(-4, 4), H * 0.55, cx + rand(-6, 6), 10);
    ctx.stroke();
    // 5-7 bold arching blade leaves, dark base -> bright tip
    var nLeaves = 5 + (Math.random() * 3) | 0;
    for (var i = 0; i < nLeaves; i++) {
      var side = (i % 2 === 0) ? 1 : -1;
      var by = H - 18 - i * ((H - 70) / nLeaves) + rand(-8, 8);   // attach point climbs the stalk
      var tipX = cx + side * rand(34, 62);                        // wide reach = readable at distance
      var tipY = by - rand(24, 60);                               // arch upward
      var midX = cx + side * rand(14, 30);
      var midY = by - rand(2, 14);
      var g = ctx.createLinearGradient(cx, by, tipX, tipY);
      g.addColorStop(0, '#35521f');
      g.addColorStop(0.55, '#5a8232');
      g.addColorStop(1, '#6f9c3e');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, by);
      ctx.quadraticCurveTo(midX, midY, tipX, tipY);                    // outer blade edge
      ctx.quadraticCurveTo(midX + side * 4, midY + 16, cx + side * 2, by + 9); // inner edge back to stalk
      ctx.closePath();
      ctx.fill();
      // center vein for silhouette readability
      ctx.strokeStyle = 'rgba(58,88,32,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, by + 2);
      ctx.quadraticCurveTo(midX, midY + 4, tipX, tipY); ctx.stroke();
    }
    // occasional ear-of-corn hint hugged to the stalk
    if (Math.random() < 0.4) {
      var ey = H - rand(60, 110);
      ctx.fillStyle = '#6f9c3e';
      ctx.beginPath(); ctx.ellipse(cx + 7, ey, 8, 16, 0.35, 0, 6.29); ctx.fill();
      ctx.strokeStyle = '#35521f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx + 3, ey - 14); ctx.lineTo(cx + 10, ey + 14); ctx.stroke();
    }
    return new THREE.CanvasTexture(c); // use with transparent:true, alphaTest:0.4, DoubleSide
  };

  /* ---------------- 5. star field (upper hemisphere shell) ---------------- */
  HogVisuals.starField = function () {
    var N = 900, R = 1400, Y_MIN = 120;
    var pos = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var y = Y_MIN + Math.random() * (R - Y_MIN);
      var rFlat = Math.sqrt(Math.max(0, R * R - y * y));
      var a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * rFlat;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(a) * rFlat;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({
      color: 0xfff4e0, size: 2.2, sizeAttenuation: false,
      transparent: true, opacity: 0.85, fog: false, depthWrite: false
    });
    return new THREE.Points(geo, mat);
  };

  /* ---------------- load-order guard (no runtime work) ---------------- */
  if (typeof window !== 'undefined' && window.THREE) {
    // THREE is present; factories are ready to call. Nothing to do at load time.
  }
})();
