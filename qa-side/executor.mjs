/* qa-trooper executor — runs SCENARIOS against a URL via a browser-use tab.
   Usage from node_repl (fresh kernel):
     const { runSuite } = await import('/Users/adam26/.zcode/workspace/default/game-fleet/qa/executor.mjs');
     const rep = await runSuite(tab, baseUrl);        // emits screenshots as it goes
   Writes qa/reports/<ts>/report.json. Browser-use evaluate() serializes the
   function — no closures over node scope inside page callbacks. */
import { SCENARIOS } from './scenarios.js';
import { writeFileSync, mkdirSync } from 'fs';

const ROOT = '/Users/adam26/.zcode/workspace/default/hog-crankers-side/qa-side';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runScenario(tab, sc, baseUrl) {
  const res = { id: sc.id, desc: sc.desc, pass: true, fails: [], warns: [], shots: [], metrics: {} };
  const q = [sc.params, 'qa=' + Date.now()].filter(Boolean).join('&');
  const url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + q;
  try {
    await tab.setViewportSize({ width: sc.viewport.width, height: sc.viewport.height });
    await tab.navigate(url);
    await sleep(1200);
    // error collector must be installed before any action
    await tab.playwright.evaluate(() => {
      window.__qaErrs = [];
      window.addEventListener('error', e => window.__qaErrs.push(String(e.message)));
    });
    // headless tabs blur on spawn and the game auto-pauses rides — keep ride scenarios live
    const wantsPause = sc.id.indexOf('pause') !== -1;
    const ensureLive = async () => {
      if (wantsPause) return;
      const p = await tab.playwright.evaluate(() => { const e = document.getElementById('pauseov'); return !!e && getComputedStyle(e).display !== 'none'; });
      if (p) await tab.playwright.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP' }));
      });
    };
    let crankW0 = 0;
    for (const a of sc.actions) {
      if (a.wait) { await sleep(a.wait); }
      else if (a.tap) {
        // title can appear late headless — retry the tap until the ride is actually running
        for (let t = 0; t < 8; t++) {
          await tab.playwright.evaluate(sel => { const el = document.querySelector(sel); if (el) el.click(); return !!el; }, a.tap.sel);
          await sleep(500);
          const riding = await tab.playwright.evaluate(() => document.body.classList.contains('hog-riding'));
          if (riding) break;
        }
      }
      else if (a.key) {
        if (a.key.code === 'Space') crankW0 = await tab.playwright.evaluate(() => { const f = document.querySelector('#meterfill'); return f ? f.getBoundingClientRect().width : 0; });
        await tab.playwright.evaluate(code => window.dispatchEvent(new KeyboardEvent('keydown', { code })), a.key.code);
        if (a.key.hold) {
          await sleep(a.key.hold);
          if (a.key.code === 'Space') {
            const w1 = await tab.playwright.evaluate(() => { const f = document.querySelector('#meterfill'); return f ? f.getBoundingClientRect().width : 0; });
            res.metrics.crankWidthBefore = +crankW0.toFixed(1);
            res.metrics.crankWidthDuring = +w1.toFixed(1);
          }
          await tab.playwright.evaluate(code => window.dispatchEvent(new KeyboardEvent('keyup', { code })), a.key.code);
        }
      }
      await ensureLive();
    }
    // settle: headless rAF throttling runs the sim in slow motion — wait (cap 15s) for the top speedGt target
    const needSpeed = (sc.asserts || []).filter(x => x.type === 'speedGt').map(x => x.v).sort((x, y) => y - x)[0];
    if (needSpeed) {
      const t0 = Date.now();
      let sp = 0;
      while (Date.now() - t0 < 15000) {
        sp = await tab.playwright.evaluate(() => parseInt((document.getElementById('speedval') || { textContent: '0' }).textContent, 10) || 0);
        if (sp > needSpeed) break;
        await sleep(300);
        await ensureLive();
      }
      res.metrics.speedSettle = sp;
      res.metrics.speedWaitMs = Date.now() - t0;
    }
    // FPS sample over ~1s
    const fps = await tab.playwright.evaluate(() => new Promise(resolve => {
      let n = 0; const t0 = performance.now();
      function f() { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else resolve(Math.round(n)); }
      requestAnimationFrame(f);
    }));
    res.metrics.fps = fps;
    // assertions
    const page = await tab.playwright.evaluate(() => ({
      errs: (window.__qaErrs || []).length,
      bodyClass: document.body.className,
      hud: (() => { const e = document.getElementById('hud'); return e ? getComputedStyle(e).display : 'missing'; })(),
      speed: parseInt((document.getElementById('speedval') || {}).textContent || '0', 10) || 0,
      meterlabel: (document.getElementById('meterlabel') || {}).textContent || ''
    })).catch(() => null);
    for (const a of sc.asserts) {
      try {
        let ok = true, note = '';
        if (a.type === 'errorsZero') { ok = page && page.errs === 0; note = 'errs=' + (page ? page.errs : '?'); }
        else if (a.type === 'bodyClass') { ok = page && a.val.split(' ').filter(Boolean).every(c => page.bodyClass.split(' ').includes(c)); note = page ? page.bodyClass : '?'; }
        else if (a.type === 'hudVisible') { ok = page && page.hud === 'block'; note = 'hud=' + (page ? page.hud : '?'); }
        else if (a.type === 'speedGt') { ok = page && page.speed > a.v; note = 'speed=' + (page ? page.speed : '?'); }
        else if (a.type === 'textHas') { const t = await tab.playwright.evaluate(sel => (document.querySelector(sel) || { textContent: '' }).textContent, a.sel); ok = t.includes(a.val); note = JSON.stringify(t).slice(0, 60); }
        else if (a.type === 'elemShown' || a.type === 'elemHidden') {
          const disp = await tab.playwright.evaluate(sel => { const e = document.querySelector(sel); return e ? getComputedStyle(e).display : 'missing'; }, a.sel);
          ok = a.type === 'elemShown' ? (disp !== 'none' && disp !== 'missing') : (disp === 'none'); note = a.sel + '=' + disp;
        }
        else if (a.type === 'crankFill') { ok = res.metrics.crankWidthDuring > (res.metrics.crankWidthBefore + 40); note = JSON.stringify(res.metrics); }
        if (!ok) { res.pass = false; res.fails.push(a.type + ' (' + note + ')'); }
      } catch (e) { res.pass = false; res.fails.push(a.type + ' THREW ' + e.message); }
    }
    // screenshot: IAB pipeline can wedge ("previous screenshot still completing") and
    // poison every later command — treat a wedged/failed shot as a WARN, never a fail
    try {
      const shot = await Promise.race([
        tab.screenshot(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('screenshot wedged >15s')), 15000)),
      ]);
      res.shots.push(sc.id);
      res._emit = shot; // caller emits
    } catch (se) { res.warns.push('shot skipped: ' + se.message); }
  } catch (e) {
    res.pass = false; res.fails.push('RUNNER ' + e.message);
  }
  return res;
}

async function runSuite(tab, baseUrl, only) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = ROOT + '/qa/reports/' + ts;
  mkdirSync(dir, { recursive: true });
  const list = only ? SCENARIOS.filter(s => only.includes(s.id)) : SCENARIOS;
  const results = [];
  for (const sc of list) {
    const r = await runScenario(tab, sc, baseUrl);
    if (r._emit) {
      writeFileSync(dir + '/' + sc.id + '.png', Buffer.from(r._emit));
      r.shots = [sc.id + '.png'];
    }
    delete r._emit;
    results.push(r);
  }
  const report = { ts, baseUrl, pass: results.every(r => r.pass), results };
  writeFileSync(dir + '/report.json', JSON.stringify(report, null, 2));
  return { report, dir };
}

export { runScenario, runSuite, SCENARIOS };
