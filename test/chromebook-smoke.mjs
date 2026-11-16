// Real-asset smoke test. This slows CPU execution; it does NOT emulate 4 GB RAM.
// Run the relay first. See docs/chromebook-performance.md for environment options.
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.env.SMOKE_BASE ?? 'http://127.0.0.1:8484';
const profile = process.env.SMOKE_PROFILE ?? path.resolve('.cache/chromebook-smoke');
const rate = Number(process.env.SMOKE_CPU_RATE ?? 2);
assert.ok(Number.isFinite(rate) && rate >= 1);
const args = [];
if (process.env.SMOKE_SOFTWARE === '1') args.push('--enable-unsafe-swiftshader');
if (process.env.SMOKE_NO_SANDBOX === '1') args.push('--no-sandbox');
const context = await chromium.launchPersistentContext(profile, {
  headless: process.env.SMOKE_HEADED !== '1', viewport: { width: 1280, height: 720 }, args,
  ...(process.env.SMOKE_CHROME ? { executablePath: process.env.SMOKE_CHROME } : { channel: 'chrome' }),
});
const page = context.pages()[0] ?? await context.newPage();
for (const other of context.pages().slice(1)) await other.close();
let timer;
let probePending = false;
let lastResponse = Date.now();
let watchdog;
try {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await page.addInitScript(() => {
    localStorage.setItem('bo1z-settings', JSON.stringify({ graphics: 'very-low', resolution: '800x450', renderer: 'webgl2', showPerf: true }));
    globalThis.__smokeHeartbeat = { ticks: 0, maxGapMs: 0, last: performance.now() };
    setInterval(() => {
      const h = globalThis.__smokeHeartbeat, now = performance.now();
      h.ticks++;
      h.maxGapMs = Math.max(h.maxGapMs, now - h.last);
      h.last = now;
    }, 100);
  });
  const unresponsive = new Promise((_, reject) => {
    watchdog = setInterval(() => {
      if (Date.now() - lastResponse > 15000) reject(new Error('The page did not answer the UI heartbeat probe for 15 seconds'));
    }, 1000);
  });
  timer = setInterval(async () => {
    if (probePending) return;
    probePending = true;
    try {
      const state = await page.evaluate(() => ({ screen: globalThis.bo1z?.view.screen, progress: globalThis.bo1z?.view.pct, heartbeat: globalThis.__smokeHeartbeat }));
      lastResponse = Date.now();
      console.log(JSON.stringify(state));
    } catch {} finally { probePending = false; }
  }, 5000);
  await page.goto(new URL('nacht', base.replace(/\/?$/, '/')).href);
  await Promise.race([
    page.waitForFunction(() => globalThis.bo1z && ['ready', 'error'].includes(bo1z.view.screen), null, { timeout: 600000 }),
    unresponsive,
  ]);
  const loaded = await page.evaluate(() => ({ screen: bo1z.view.screen, report: bo1z.view.report, canvas: bo1z.diagnostics.canvas, memory: bo1z.engine()?.telemetryMemory(), heartbeat: globalThis.__smokeHeartbeat }));
  console.log('LOADED', JSON.stringify(loaded));
  assert.equal(loaded.screen, 'ready', loaded.report);
  assert.deepEqual(loaded.canvas, { width: 800, height: 450 });
  assert.ok(loaded.memory.wasmBreak > 0);
  await page.bringToFront();
  await page.click('.kb-prompt');
  await Promise.race([
    page.waitForFunction(() => bo1z.view.screen === 'playing' && Boolean(document.pointerLockElement), null, { timeout: 20000 }),
    unresponsive,
  ]);
  await page.evaluate(() => bo1z.net.command('cl_paused'));
  // Startup logging is bounded: indices move when old game logs are discarded.
  await page.waitForFunction(() => bo1z.diagnostics.console.some(row => /"cl_paused" is: "0/.test(row.message)), null, { timeout: 60000 });
  await page.keyboard.down('w');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  await page.evaluate(() => { globalThis.__smokeReader = bo1z.engine().presentReader(); globalThis.__smokeFrames = 0; __smokeReader(); });
  // First-person shaders can compile after map-loaded; a three-second sample
  // can contain no presents without the engine being deadlocked. Keep testing
  // UI responsiveness while waiting for real game frames, not just Ready.
  await Promise.race([
    page.waitForFunction(() => { globalThis.__smokeFrames += __smokeReader()?.intervals.length ?? 0; return __smokeFrames >= 30; }, null, { timeout: 180000 }),
    unresponsive,
  ]);
  const playing = await page.evaluate(() => ({
    screen: bo1z.view.screen, frames: globalThis.__smokeFrames,
    heartbeat: globalThis.__smokeHeartbeat, failure: bo1z.view.failure,
    overlayMemory: document.querySelector('#perf-overlay')?.textContent,
    errors: bo1z.diagnostics.errors,
  }));
  console.log('PLAYING', JSON.stringify(playing));
  assert.equal(playing.screen, 'playing');
  assert.equal(playing.failure, null);
  assert.ok(playing.frames > 0);
  assert.ok(playing.heartbeat.ticks > 10);
  const pixels = await page.evaluate(() => {
    const image = document.createElement('canvas');
    image.width = 80; image.height = 45;
    const ctx = image.getContext('2d');
    ctx.drawImage(document.querySelector('#game'), 0, 0, 80, 45);
    const data = ctx.getImageData(0, 0, 80, 45).data;
    let visible = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 30) visible++;
    return { visible, total: 80 * 45 };
  });
  console.log('GAME PIXELS', JSON.stringify(pixels));
  await mkdir('.cache', { recursive: true });
  await page.screenshot({ path: '.cache/chromebook-gameplay.png' });
  assert.ok(pixels.visible > 100, 'Game canvas is still almost entirely black');
  // Verify the page can still process an Escape and render the game's menu.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  await page.evaluate(() => bo1z.net.command('cl_paused'));
  await page.waitForFunction(() => /\"cl_paused\" is: \"1/.test(bo1z.diagnostics.console.findLast(row => row.message.includes('\"cl_paused\"'))?.message ?? ''), null, { timeout: 20000 });
  await mkdir('.cache', { recursive: true });
  await page.screenshot({ path: '.cache/chromebook-smoke.png' });
  console.log('PASS: real map loaded, entered gameplay, presented frames, and page remained responsive with FPS/memory enabled');
} catch (error) {
  await mkdir('.cache', { recursive: true });
  try {
    const state = await Promise.race([
      page.evaluate(() => ({ screen: bo1z.view.screen, report: bo1z.view.report, heartbeat: globalThis.__smokeHeartbeat, logs: bo1z.diagnostics.console.slice(-100), errors: bo1z.diagnostics.errors })),
      new Promise((_, reject) => setTimeout(() => reject(new Error('page unresponsive')), 5000)),
    ]);
    await writeFile('.cache/chromebook-smoke-failure.json', JSON.stringify(state, null, 2));
    console.log('FAILURE', JSON.stringify(state));
  } catch {}
  throw error;
} finally {
  clearInterval(timer);
  clearInterval(watchdog);
  await context.close();
}
