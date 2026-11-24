// Headless Chrome playtest: desktop + mobile viewports, no console errors, screenshots.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = path.join(root, 'shots');
const PORT = 8766;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/index.html';
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end(String(err));
    }
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

function chromePath() {
  for (const p of [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]) {
    if (p && existsSync(p)) return p;
  }
  return undefined;
}

async function waitReady(page, timeout = 20000) {
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1' || document.querySelector('canvas')?.dataset.ready === '1', null, { timeout });
  await page.waitForTimeout(400);
}

async function canvasLooksPainted(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return { ok: false, reason: 'no canvas' };
    const w = Math.min(c.width, 64), h = Math.min(c.height, 64);
    if (!w || !h) return { ok: false, reason: 'zero size', width: c.width, height: c.height };
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    // We cannot read the used context; sample via a 2d copy if 2d is free — otherwise
    // use the MH hook to read pixels from the renderer.
    const R = window.MH?.renderer;
    if (!R?.renderer) return { ok: false, reason: 'no renderer hook' };
    const glr = R.renderer.getContext();
    const pixels = new Uint8Array(4 * 8 * 8);
    // read a mid-screen block (bottom-left origin)
    const x = Math.max(0, ((c.width / (window.devicePixelRatio || 1)) / 2) | 0);
    const y = Math.max(0, ((c.height / (window.devicePixelRatio || 1)) / 3) | 0);
    // WebGL drawing buffer is c.width x c.height already in device pixels.
    const rx = Math.max(0, (c.width / 2 - 4) | 0);
    const ry = Math.max(0, (c.height / 2 - 4) | 0);
    glr.readPixels(rx, ry, 8, 8, glr.RGBA, glr.UNSIGNED_BYTE, pixels);
    let sum = 0, nonempty = 0, colors = new Set();
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      sum += r + g + b;
      if (r + g + b > 12) nonempty++;
      colors.add(`${r>>4}-${g>>4}-${b>>4}`);
    }
    const avg = sum / 64;
    return { ok: nonempty >= 8 && avg > 16, nonempty, colors: colors.size, avg, width: c.width, height: c.height };
  });
}

async function withPage(browser, viewport, urlPath, fn) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: viewport.deviceScaleFactor || 1,
    isMobile: !!viewport.isMobile,
    hasTouch: !!viewport.hasTouch,
    userAgent: viewport.userAgent,
  });
  const page = await context.newPage();
  const errors = [];
  const logs = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    const text = msg.text();
    logs.push({ type: msg.type(), text });
    if (msg.type() === 'error') errors.push(text);
  });
  page.on('requestfailed', (req) => {
    errors.push(`request failed: ${req.url()} ${req.failure()?.errorText || ''}`);
  });
  const url = `http://127.0.0.1:${PORT}${urlPath}`;
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (!resp || !resp.ok()) errors.push(`navigation ${resp && resp.status()}`);
  await fn(page, errors, logs);
  await context.close();
  return { errors, logs };
}

async function main() {
  await mkdir(shotsDir, { recursive: true });
  const server = await startServer();
  const executablePath = chromePath();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader-webgl',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--use-cmd-decoder=passthrough',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  const report = { ok: true, shots: [], viewports: {}, chrome: executablePath };
  const ignore = (e) =>
    /failed to load preferences|Failed to create WebGPU|AudioContext was not allowed|favicon|status of 404/i.test(e);

  try {
    // ---- Desktop: scenic sunset from the path, title dismissed ----
    await withPage(browser, { width: 1440, height: 900 }, '/?fresh=1&shot=1&time=sunset&freeze=1', async (page, errors) => {
      await waitReady(page);
      await page.evaluate(() => {
        const M = window.MH;
        M.begin();
        // Down the slope, a little to the right, looking back at the cabin and the sunset sky.
        const x = 8.2, z = 12.4;
        const yaw = Math.atan2(0.2 - x, 2.4 - z);
        M.place(x, z, yaw);
        M.look(yaw, -0.06);
        M.snapCamera();
        M.tick(4);
        M.snapCamera();
      });
      const painted = await canvasLooksPainted(page);
      const shot = path.join(shotsDir, '01-sunset-path.png');
      await page.screenshot({ path: shot, type: 'png' });
      report.shots.push(shot);
      report.viewports.desktop = { errors: errors.filter((e) => !ignore(e)), painted };
      if (!painted.ok) report.ok = false;
      if (errors.filter((e) => !ignore(e)).length) report.ok = false;
    });

    // ---- Desktop: porch repair mid-task, then garden + hearth at dusk ----
    await withPage(browser, { width: 1440, height: 900 }, '/?fresh=1&shot=1&time=sunset&freeze=1', async (page, errors) => {
      await waitReady(page);
      await page.evaluate(() => {
        const M = window.MH;
        M.begin();
        M.place(0.35, 9.1, Math.PI + 0.06);
        M.look(Math.PI + 0.06, -0.18);
        M.snapCamera();
        // Walk up and repair the porch, then step back for the picture.
        M.place(-1.15, 5.15, Math.PI);
        M.holdUse(1.4);
        M.place(0.35, 9.1, Math.PI + 0.06);
        M.look(Math.PI + 0.06, -0.18);
        M.snapCamera();
        M.tick(2);
        M.snapCamera();
      });
      const shot = path.join(shotsDir, '02-porch-and-cabin.png');
      await page.screenshot({ path: shot, type: 'png' });
      report.shots.push(shot);

      const after = await page.evaluate(() => {
        const M = window.MH;
        // Light the fire, grow the garden, go inside at night for the hearth shot.
        M.state.tasks.garden.planted = true;
        M.state.tasks.garden.watered = true;
        M.state.tasks.garden.growth = 1;
        M.state.tasks.fire.lit = true;
        M.setTime(0.88);
        M.state.toast = '';
        M.state.toastT = 0;
        // Stand a little back so the couple and the flames are both in frame.
        M.place(0.15, 0.55, Math.PI);
        M.look(Math.PI, -0.08);
        M.state.partner.x = 0.7;
        M.state.partner.z = -1.25;
        M.state.partner.yaw = Math.PI + 0.15;
        M.state.partner.mood = 'hearth';
        M.snapCamera();
        M.tick(6);
        M.snapCamera();
        return {
          porch: M.state.tasks.porch.done,
          garden: M.state.tasks.garden.growth,
          fire: M.state.tasks.fire.lit,
          nearWas: M.state.near,
        };
      });
      const shot3 = path.join(shotsDir, '03-hearth-night.png');
      await page.screenshot({ path: shot3, type: 'png' });
      report.shots.push(shot3);
      report.tasks = after;
      if (!after.porch || !after.fire) report.ok = false;
      if (errors.filter((e) => !ignore(e)).length) report.ok = false;
      report.viewports.desktopInterior = { errors: errors.filter((e) => !ignore(e)) };
    });

    // ---- Mobile viewport with on-screen controls ----
    await withPage(
      browser,
      {
        width: 390,
        height: 844,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
      '/?fresh=1&shot=1&touch=1&time=sunset&freeze=1',
      async (page, errors) => {
        await waitReady(page);
        await page.evaluate(() => {
          const M = window.MH;
          M.begin();
          const x = 7.4, z = 11.6;
          const yaw = Math.atan2(0.2 - x, 2.6 - z);
          M.place(x, z, yaw);
          M.look(yaw, -0.04);
          M.snapCamera();
          M.tick(3);
          M.snapCamera();
        });
        const painted = await canvasLooksPainted(page);
        const stick = await page.$('#stick');
        const use = await page.$('#usebtn');
        const stickVisible = stick && await stick.isVisible();
        const useVisible = use && await use.isVisible();
        const shot = path.join(shotsDir, '04-mobile-sunset.png');
        await page.screenshot({ path: shot, type: 'png' });
        report.shots.push(shot);
        report.viewports.mobile = {
          errors: errors.filter((e) => !ignore(e)),
          painted,
          stickVisible,
          useVisible,
        };
        if (!painted.ok || !stickVisible || !useVisible) report.ok = false;
        if (errors.filter((e) => !ignore(e)).length) report.ok = false;
      },
    );

    // ---- Soundtrack: files serve, bed picker, no console errors after a gesture ----
    await withPage(browser, { width: 1280, height: 800 }, '/?fresh=1&shot=1&time=sunset&freeze=1', async (page, errors) => {
      await waitReady(page);
      const files = await page.evaluate(async () => {
        const names = [
          'porch_sunset', 'stinger_task', 'explore_day', 'explore_night',
          'hearth_night', 'garden_morning', 'fixing_up', 'stargazing',
          'together', 'main_theme', 'stinger_save',
        ];
        const out = {};
        for (const n of names) {
          const r = await fetch('./music/' + n + '.ogg');
          out[n] = { status: r.status, type: r.headers.get('content-type') || '', size: (await r.arrayBuffer()).byteLength };
        }
        return out;
      });
      // Gesture then unlock, tick a default sunset state, and read the chosen bed.
      await page.click('#mutebtn'); // unlocks; also toggles mute — toggle back
      await page.click('#mutebtn');
      const audio = await page.evaluate(async () => {
        const M = window.MH;
        await M.audio.unlock();
        M.begin();
        M.setTime(0.73);
        M.audio.tick(M.state);
        const pick = {
          sunset: M.audio.chooseBed(M.state),
        };
        // Night outdoors, stars
        M.setTime(0.96);
        M.place(8, 12);
        pick.stars = M.audio.chooseBed(M.state);
        // Lit hearth at night, inside
        M.state.tasks.fire.lit = true;
        M.setTime(0.1);
        M.place(0.2, -1.0);
        pick.hearth = M.audio.chooseBed(M.state);
        // All done
        M.state.tasks.porch.done = true;
        M.state.tasks.garden.planted = true;
        M.state.tasks.garden.watered = true;
        M.state.complete = true;
        pick.together = M.audio.chooseBed(M.state);
        return {
          muted: M.audio.muted,
          pick,
          current: M.audio.currentBed,
        };
      });
      report.audio = { files, audio, errors: errors.filter((e) => !ignore(e)) };
      const missing = Object.entries(files).filter(([, v]) => v.status !== 200 || v.size < 1000);
      const picksOk = audio.pick.sunset === 'porch_sunset'
        && audio.pick.stars === 'stargazing'
        && audio.pick.hearth === 'hearth_night'
        && audio.pick.together === 'together';
      if (missing.length || !picksOk || report.audio.errors.length) report.ok = false;
      if (!picksOk) report.audio.pickFailed = audio.pick;
      if (missing.length) report.audio.missing = missing;
    });
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }

  const out = path.join(shotsDir, 'playtest.json');
  await writeFile(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    console.error('PLAYTEST FAILED');
    process.exit(1);
  }
  console.log('PLAYTEST OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
