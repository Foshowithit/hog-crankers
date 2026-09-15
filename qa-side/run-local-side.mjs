/* run-local.mjs — run the qa-trooper suite under plain Playwright (headless Chrome),
   no browser-use/IAB needed. Durable path for the endless loop: no 120s kernel cap,
   no IAB screenshot wedge, real PNG shots.
   Usage: node run-local.mjs [scenarioId ...]   (no args = all 5)
*/
import { runSuite } from './executor.mjs';

const PLAYWRIGHT_PATHS = [
  'file:///Users/adam26/.nvm/versions/node/v24.15.0/lib/node_modules/playwright/index.mjs',
];
let pw = null;
for (const p of PLAYWRIGHT_PATHS) { try { pw = await import(p); break; } catch {} }
if (!pw) { console.error('playwright not importable'); process.exit(2); }

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
