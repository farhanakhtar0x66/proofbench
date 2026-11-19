// Captures README media from a replay of a recorded live race (no model calls).
// Needs the dev server (npm run dev). Writes docs/assets/screens/race-*.jpg, docs/assets/race.gif and race-demo.mp4.
import { execFile } from 'node:child_process';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { chromium, type Page } from 'playwright';

const exec = promisify(execFile);
const base = process.env.WEB_URL ?? 'http://127.0.0.1:5173';
const out = 'docs/assets/screens';
const videoDir = '.local/capture-video';
// The recorded race shown in the README (pass another id to capture a different one).
const RACE = process.env.RACE_ID ?? '2026-11-19T17-19-32-917Z-852bb4';
await mkdir(out, { recursive: true });
await rm(videoDir, { recursive: true, force: true });

async function replay(page: Page, speed: string) {
  await page.goto(`${base}/race`);
  await page.waitForSelector('.gateway-chip');
  await page.selectOption('.replay-pick select', RACE);
  await page.selectOption('.replay-speed select', speed);
  await page.getByRole('button', { name: 'Replay recorded race' }).click();
  await page.waitForSelector('.lane');
}

const browser = await chromium.launch();
for (const theme of ['dark', 'light'] as const) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2, colorScheme: theme });
  const page = await context.newPage();
  await page.addInitScript(t => localStorage.setItem('proofbench_theme', t), theme);
  await replay(page, '8');
  // Mid-race: Cascade has escalated, the big model is still working.
  await page.waitForSelector('.lane-cascade .escalation', { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.locator('.race-lanes').screenshot({ path: join(out, `race-lanes-${theme}.jpg`), quality: 85 });
  await page.waitForSelector('.scoreboard.ready', { timeout: 90_000 });
  await page.waitForSelector('.lane-large.finished', { timeout: 90_000 });
  await page.locator('.scoreboard').screenshot({ path: join(out, `race-result-${theme}.jpg`), quality: 85 });
  await context.close();
}

// Animated overview for the top of the README.
const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'dark', recordVideo: { dir: videoDir, size: { width: 1280, height: 860 } } });
const page = await context.newPage();
await page.addInitScript(() => localStorage.setItem('proofbench_theme', 'dark'));
await page.goto(`${base}/race`);
await page.waitForSelector('.gateway-chip');
await page.evaluate(() => window.scrollTo(0, 330));
await page.selectOption('.replay-pick select', RACE);
await page.selectOption('.replay-speed select', '8');
await page.getByRole('button', { name: 'Replay recorded race' }).click();
await page.waitForSelector('.lane');
await page.evaluate(() => document.querySelector('.race-banner')?.scrollIntoView({ block: 'start' }));
await page.waitForSelector('.lane-large.finished', { timeout: 90_000 });
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector('.scoreboard')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
await page.waitForTimeout(2500);
await context.close();
await browser.close();

const video = (await readdir(videoDir)).find(f => f.endsWith('.webm'));
if (video) {
  await exec('ffmpeg', ['-y', '-i', join(videoDir, video), '-vf', 'fps=6,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', 'docs/assets/race.gif']);
  console.log('Wrote docs/assets/race.gif');
  await exec('ffmpeg', ['-y', '-i', join(videoDir, video), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-movflags', '+faststart', 'docs/assets/race-demo.mp4']);
  console.log('Wrote docs/assets/race-demo.mp4');
}
console.log('Wrote race screenshots to', out);
