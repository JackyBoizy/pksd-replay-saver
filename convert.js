/**
 * Pokémon Showdown Replay → MP4
 * FAST VERSION (faster than real-time)
 *
 * Usage:
 *   node convert.js <replay-url | replay-id> [output.mp4]
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// ---------- CONFIG ----------
const FPS = 15;                 // lower FPS = MUCH faster
const WIDTH = 1280;
const HEIGHT = 720;
const MAX_SECONDS = 300;        // hard safety cap (5 min)
const FRAMES_DIR = "./frames";
const JPEG_QUALITY = 80;
// ----------------------------

const input = process.argv[2];
const output = process.argv[3] || "output.mp4";

if (!input) {
  console.error("Usage: node convert.js <replay-url | replay-id> [output.mp4]");
  process.exit(1);
}

// Normalize replay ID / URL
const replayId = input
  .replace(/^https?:\/\/replay\.pokemonshowdown\.com\//, "")
  .split("?")[0];

const replayUrl = `https://replay.pokemonshowdown.com/${replayId}`;

fs.mkdirSync(FRAMES_DIR, { recursive: true });

(async () => {
  console.log("🌐 Loading replay:", replayUrl);

  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: WIDTH, height: HEIGHT },
  });

  const page = await browser.newPage();

  await page.goto(replayUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  console.log("⏳ Waiting for battle UI...");
  await page.waitForSelector(".battle", { timeout: 60000 });

  console.log("⚡ Forcing max replay speed + play");

  // Click speed button multiple times, then play
  await page.evaluate(() => {
    const speedBtn = document.querySelector('button[name="speed"]');
    if (speedBtn) {
      for (let i = 0; i < 6; i++) speedBtn.click(); // max speed
    }

    const playBtn =
      document.querySelector('button[name="play"]') ||
      document.querySelector(".replay-controls button");

    if (!playBtn) throw new Error("Play button not found");
    playBtn.click();
  });

  console.log("🎥 Recording frames (FASTER THAN REAL-TIME)");

  let frame = 0;
  const maxFrames = FPS * MAX_SECONDS;
  const startTime = Date.now();
  let lastLogSecond = -1;

  while (frame < maxFrames) {
    // Replay ends when Play button becomes enabled again
    const ended = await page.evaluate(() => {
      const btn = document.querySelector('button[name="play"]');
      return btn && !btn.disabled;
    });

    if (ended && frame > FPS * 2) break;

    const name = String(frame).padStart(5, "0");

    await page.screenshot({
      path: path.join(FRAMES_DIR, `frame_${name}.jpg`),
      type: "jpeg",
      quality: JPEG_QUALITY,
    });

    frame++;

    // -------- ETA / PROGRESS --------
    const elapsedSec = (Date.now() - startTime) / 1000;
    const progress = frame / maxFrames;
    const estimatedTotal = elapsedSec / Math.max(progress, 0.01);
    const remainingSec = Math.max(0, estimatedTotal - elapsedSec);

    const logSecond = Math.floor(elapsedSec);
    if (logSecond !== lastLogSecond) {
      lastLogSecond = logSecond;

      const fmt = s =>
        `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

      process.stdout.write(
        `\r⚡ ${Math.round(progress * 100)}% | elapsed ${fmt(elapsedSec)} | remaining ~${fmt(remainingSec)}   `
      );
    }
    // --------------------------------

    // ❌ NO REAL-TIME WAIT — let it run flat out
    await new Promise(r => setTimeout(r, 0));
  }

  console.log();
  console.log(`🧩 Captured ${frame} frames`);

  await browser.close();

  console.log("🎬 Encoding MP4 (FFmpeg)...");

  execSync(
    `ffmpeg -y -framerate ${FPS} -i "${FRAMES_DIR}/frame_%05d.jpg" -c:v libx264 -pix_fmt yuv420p "${output}"`,
    { stdio: "inherit" }
  );

  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });

  console.log("✅ Done:", output);
})();
