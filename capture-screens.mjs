// Captures screenshots of the real running application, including the
// staff-only screens, by signing in with the staff PIN first.
import puppeteer from "puppeteer-core";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CHROME =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SITE = process.env.SITE || "https://asmt-aegis.vercel.app";
const OUT = "docs/screenshots";

// Read the PIN from the local env file; never hardcode it.
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

const PHONE = { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const WIDE = { width: 1280, height: 900, deviceScaleFactor: 2 };

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
});

async function grab(file, path, viewport, opts = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  try {
    await page.goto(`${SITE}${path}`, { waitUntil: "networkidle2", timeout: 45000 });
    await new Promise((r) => setTimeout(r, opts.settle ?? 2500));
    if (opts.before) await opts.before(page);

    // A full-page capture renders position:fixed elements once, stranding the
    // bottom bar in the middle of the image. Hide them so the screenshot shows
    // the page content as a reader actually scrolls through it.
    if (opts.fullPage) {
      await page.addStyleTag({
        content:
          'nav, a[href^="tel:"], [class*="fixed"][class*="z-[60]"] { display: none !important; } main { padding-bottom: 1rem !important; }',
      });
      await new Promise((r) => setTimeout(r, 400));
    }
    await page.screenshot({
      path: join(OUT, file),
      fullPage: Boolean(opts.fullPage),
    });
    console.log(`  ${file}`);
  } catch (e) {
    console.log(`  ${file}  FAILED: ${e.message.slice(0, 90)}`);
  } finally {
    await page.close();
  }
}

console.log("public screens...");
await grab("01-home.png", "/", PHONE);
await grab("02-report-form.png", "/report", PHONE, { fullPage: true });
await grab("03-safe-walk.png", "/safe-walk", PHONE, { fullPage: true });
await grab("04-accessibility.png", "/accessibility", PHONE, { fullPage: true });
await grab("05-my-reports.png", "/status", PHONE);

// --- staff sign-in, then the protected screens ---------------------------
console.log("signing in as staff...");
const loginPage = await browser.newPage();
await loginPage.setViewport(WIDE);
await loginPage.goto(`${SITE}/dashboard`, { waitUntil: "networkidle2" });
const ok = await loginPage.evaluate(async (pin) => {
  const res = await fetch("/api/staff/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  return res.ok;
}, env.STAFF_PIN);
console.log(`  staff session: ${ok ? "established" : "FAILED"}`);
await loginPage.close();

console.log("staff screens...");
// Phone viewport throughout: this is a phone-first app and mixing desktop
// shots would misrepresent how it is actually used.
await grab("06-responder-dashboard.png", "/dashboard", PHONE, { settle: 4500 });
await grab("07-analytics.png", "/analytics", PHONE, { settle: 4000, fullPage: true });
await grab("08-qr-generator.png", "/admin/qr", PHONE, { settle: 4500 });

await browser.close();
console.log("done");
