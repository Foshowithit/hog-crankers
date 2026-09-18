/* run-local.mjs — run the qa-trooper suite under plain Playwright (headless Chrome),
   no browser-use/IAB needed. Durable path for the endless loop: no 120s kernel cap,
   no IAB screenshot wedge, real PNG shots.
   Usage: node run-local.mjs [scenarioId ...]   (no args = all 5)
*/
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'path';
import { pathToFileURL } from 'node:url';
import { runSuite } from './executor.mjs';

const PLAYWRIGHT_PATHS = [
  process.env.PLAYWRIGHT_ENTRY,
  (() => { try { return pathToFileURL(createRequire(import.meta.url).resolve('playwright')).href; } catch { return null; } })(),
  (() => { try { return pathToFileURL(path.join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs')).href; } catch { return null; } })(),
].filter(Boolean);
let pw = null;
for (const p of PLAYWRIGHT_PATHS) {
  try { const m = await import(p); pw = m.chromium ? m : m.default; break; } catch {}
}
if (!pw || !pw.chromium) { console.error('playwright not importable (set PLAYWRIGHT_ENTRY)'); process.exit(2); }

const browser = await pw.chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--hide-scrollbars', '--mute-audio'],
});

/* duck-typed tab for the executor: setViewportSize / navigate / playwright.evaluate / screenshot */
const page = await (await browser.newContext()).newPage();
const tab = {
  async setViewportSize(o) { await page.setViewportSize(o); },
  async navigate(url) { await page.goto(url, { waitUntil: 'load', timeout: 30000 }); },
  playwright: {
    evaluate: (fn, arg) => page.evaluate(fn, arg),
  },
  async screenshot() { return page.screenshot({ type: 'png' }); },
};

const only = process.argv.slice(2);
const { report, dir } = await runSuite(tab, 'http://127.0.0.1:8181/', only.length ? only : undefined);
console.log('REPORT_DIR=' + dir);
console.log(JSON.stringify(report.results.map(r => ({ id: r.id, pass: r.pass, fails: r.fails, warns: r.warns, fps: r.metrics.fps, speed: r.metrics.speedSettle })), null, 1));
console.log('SUITE_PASS=' + report.pass);
await browser.close();
process.exit(report.pass ? 0 : 1);
