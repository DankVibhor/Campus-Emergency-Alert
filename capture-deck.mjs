// Captures uniform phone-viewport screenshots for the 5-slide deck.
// Full-page shots vary wildly in height; a deck needs one aspect ratio.
import puppeteer from "puppeteer-core";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SITE = "https://asmt-aegis.vercel.app";
const OUT = process.argv[2];

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

mkdirSync(OUT, { recursive: true });
const PHONE = { width: 430, height: 880, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
});

async function grab(file, path, opts = {}) {
  const page = await browser.newPage();
  await page.setViewport(PHONE);
  try {
    await page.goto(`${SITE}${path}`, { waitUntil: "networkidle2", timeout: 45000 });
    await new Promise((r) => setTimeout(r, opts.settle ?? 3000));
    if (opts.scrollTo) {
      await page.evaluate((y) => window.scrollTo(0, y), opts.scrollTo);
      await new Promise((r) => setTimeout(r, 900));
    }
    await page.screenshot({ path: join(OUT, file) });
    console.log(`  ${file}`);
  } catch (e) {
    console.log(`  ${file} FAILED: ${e.message.slice(0, 80)}`);
  } finally {
    await page.close();
  }
}

await grab("home.png", "/");
// Scroll past the header so the emergency-type grid is the hero of the shot.
await grab("report.png", "/report", { scrollTo: 240 });
await grab("safewalk.png", "/safe-walk");
await grab("accessibility.png", "/accessibility");

const p = await browser.newPage();
await p.setViewport(PHONE);
await p.goto(`${SITE}/dashboard`, { waitUntil: "networkidle2" });
await p.evaluate(async (pin) => {
  await fetch("/api/staff/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
}, env.STAFF_PIN);
await p.close();

// Scroll to the incident cards rather than the header links.
await grab("dashboard.png", "/dashboard", { settle: 4500, scrollTo: 620 });
await grab("analytics.png", "/analytics", { settle: 4000, scrollTo: 120 });

await browser.close();
console.log("done");
