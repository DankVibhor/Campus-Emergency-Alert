// Generates the ASMT Aegis submission deck (8 slides) as a .pptx.
import PptxGenJS from "pptxgenjs";
import { join } from "node:path";

const SHOTS = process.argv[2];
const OUT = process.argv[3];

const INK = "17161A";
const SOFT = "55525C";
const MUTE = "8A8791";
const ACCENT = "DC2626";
const WASH = "FDECEB";
const SURFACE = "F7F6F5";
const RULE = "E2E0DD";
const GOOD = "15803D";
const AMBER = "B45309";

const DISPLAY = "Segoe UI Black";
const BODY = "Segoe UI";
const MONO = "Consolas";

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_16x9";
pptx.author = "Bhand Coders";
pptx.company = "Anangpuria School of Management and Technology";
pptx.title = "ASMT Aegis";
pptx.subject = "A.S.M.T. Hackathon 2K26";

const W = 13.33;
const H = 7.5;
const M = 0.7;

const PH_H = 4.3;
const PH_W = PH_H * (430 / 880);

const shot = (n) => join(SHOTS, `${n}.png`);
let no = 0;

/** Header + footer chrome shared by every content slide. */
function slide(title, kicker) {
  no += 1;
  const s = pptx.addSlide();
  s.background = { color: "FFFFFF" };

  s.addText(String(no).padStart(2, "0"), {
    x: M, y: 0.42, w: 0.5, h: 0.3,
    fontFace: MONO, fontSize: 11.5, bold: true, color: ACCENT,
  });
  s.addText(title, {
    x: M + 0.46, y: 0.33, w: W - M * 2 - 3.4, h: 0.48,
    fontFace: DISPLAY, fontSize: 25, color: INK,
  });
  if (kicker) {
    s.addText(kicker.toUpperCase(), {
      x: W - M - 3.4, y: 0.45, w: 3.4, h: 0.28,
      fontFace: MONO, fontSize: 9, bold: true, color: MUTE,
      align: "right", charSpacing: 1.5,
    });
  }
  s.addShape(pptx.ShapeType.rect, {
    x: M, y: 0.86, w: W - M * 2, h: 0.026,
    fill: { color: INK }, line: { width: 0 },
  });
  s.addText("ASMT Aegis   ·   Bhand Coders   ·   asmt-aegis.vercel.app", {
    x: M, y: 7.03, w: 8, h: 0.26, fontFace: BODY, fontSize: 8.5, color: MUTE,
  });
  return s;
}

function points(s, items, o = {}) {
  const runs = [];
  items.forEach((it, i) => {
    const lead = typeof it === "string" ? null : it.lead;
    const rest = typeof it === "string" ? it : it.text;
    if (lead) runs.push({ text: lead + " ", options: { bold: true, color: INK } });
    runs.push({ text: rest, options: { color: SOFT, breakLine: true } });
    if (i < items.length - 1) {
      runs.push({ text: "", options: { breakLine: true, fontSize: 6 } });
    }
  });
  s.addText(runs, {
    x: o.x ?? M, y: o.y ?? 1.12, w: o.w ?? W - M * 2, h: o.h ?? 5.2,
    fontFace: BODY, fontSize: o.size ?? 12,
    lineSpacing: (o.size ?? 12) * 1.44,
    bullet: { code: "2013", indent: 15 }, valign: "top",
  });
}

function callout(s, text, o = {}) {
  const x = o.x ?? M, y = o.y ?? 5.7, w = o.w ?? W - M * 2, h = o.h ?? 0.86;
  s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: WASH }, line: { width: 0 } });
  s.addShape(pptx.ShapeType.rect, { x, y, w: 0.05, h, fill: { color: ACCENT }, line: { width: 0 } });
  s.addText(text, {
    x: x + 0.24, y: y + 0.05, w: w - 0.44, h: h - 0.1,
    fontFace: BODY, fontSize: o.size ?? 11.5, color: INK, valign: "middle",
  });
}

function sectionLabel(s, text, x, y, w, color = MUTE) {
  s.addText(text.toUpperCase(), {
    x, y, w, h: 0.26,
    fontFace: MONO, fontSize: 9, bold: true, color, charSpacing: 1.5,
  });
}

function phone(s, name, x, y, caption, scale = 1) {
  const w = PH_W * scale, h = PH_H * scale;
  s.addImage({ path: shot(name), x, y, w, h });
  if (caption) {
    s.addText(caption, {
      x: x - 0.35, y: y + h + 0.09, w: w + 0.7, h: 0.28,
      fontFace: BODY, fontSize: 10.5, bold: true, color: INK, align: "center",
    });
  }
  return { w, h };
}

function statTiles(s, items, y) {
  const gap = 0.22;
  const w = (W - M * 2 - gap * (items.length - 1)) / items.length;
  items.forEach((it, i) => {
    const x = M + i * (w + gap);
    s.addShape(pptx.ShapeType.rect, {
      x, y, w: 0.045, h: 0.88, fill: { color: ACCENT }, line: { width: 0 },
    });
    s.addText(it.n, {
      x: x + 0.16, y: y - 0.04, w: w - 0.16, h: 0.55,
      fontFace: DISPLAY, fontSize: 28, color: INK,
    });
    s.addText(it.l, {
      x: x + 0.16, y: y + 0.5, w: w - 0.16, h: 0.34,
      fontFace: BODY, fontSize: 10, color: MUTE,
    });
  });
}

/* ═══════════════════════════════ 1 · TITLE */
{
  no = 1;
  const s = pptx.addSlide();
  s.background = { color: "FFFFFF" };

  s.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: W, h: 4.2, fill: { color: ACCENT }, line: { width: 0 },
  });

  s.addText("A.S.M.T. HACKATHON 2K26     ·     TEAM BHAND CODERS", {
    x: M, y: 0.78, w: 9.4, h: 0.3,
    fontFace: MONO, fontSize: 11.5, bold: true, color: "FFFFFF", charSpacing: 2,
  });
  s.addText("ASMT Aegis", {
    x: M - 0.07, y: 1.2, w: 9.4, h: 1.4,
    fontFace: DISPLAY, fontSize: 64, color: "FFFFFF",
  });
  s.addText(
    "Campus emergency response for a three-block college.\nScan a QR code, hold one button — the right responder is paged in seconds, with the urgency already judged.",
    { x: M, y: 2.68, w: 9.1, h: 1.1, fontFace: BODY, fontSize: 15, color: "FFFFFF", lineSpacing: 24 },
  );

  phone(s, "home", 10.45, 1.05, null, 0.92);

  const cw = (9.1 - 0.44) / 3;
  const meta = [
    { l: "TEAM", big: "Bhand Coders" },
    { l: "BUILT BY", lines: "Vibhor Mehta\nDevanshu Gupta\nSunny Gujjar", bold: true, size: 12.5 },
    { l: "LIVE NOW", lines: "asmt-aegis.vercel.app\n\nAnangpuria School of\nManagement & Technology", size: 11 },
  ];
  meta.forEach((m, i) => {
    const x = M + i * (cw + 0.22);
    s.addShape(pptx.ShapeType.rect, {
      x, y: 4.6, w: cw, h: 1.95, fill: { color: SURFACE }, line: { color: RULE, width: 1 },
    });
    sectionLabel(s, m.l, x + 0.2, 4.76, cw - 0.4);
    if (m.big) {
      s.addText(m.big, {
        x: x + 0.2, y: 5.02, w: cw - 0.4, h: 0.5,
        fontFace: DISPLAY, fontSize: 20, color: INK,
      });
    }
    if (m.lines) {
      s.addText(m.lines, {
        x: x + 0.2, y: 5.04, w: cw - 0.4, h: 1.3,
        fontFace: BODY, fontSize: m.size, bold: Boolean(m.bold),
        color: m.bold ? INK : SOFT, lineSpacing: m.bold ? 19 : 15,
      });
    }
  });

  s.addText("ASMT Aegis   ·   Bhand Coders", {
    x: M, y: 7.03, w: 6, h: 0.26, fontFace: BODY, fontSize: 8.5, color: MUTE,
  });
}

/* ═══════════════════════════════ 2 · PROBLEM */
{
  const s = slide("Why a form is not enough");

  s.addText(
    "Three blocks. One shared WhatsApp group. No record, no priority, no ownership.",
    { x: M, y: 1.08, w: W - M * 2, h: 0.36, fontFace: BODY, fontSize: 15, bold: true, color: INK },
  );

  const items = [
    ["Nobody knows the number", "A student in an emergency is scrolling contacts for a warden's number they never saved."],
    ["The details are lost", "A phone call leaves no record of which block, which floor, or what was actually said."],
    ["Everything looks equally urgent", "A sprained ankle and someone who has stopped breathing arrive in the same group, in the same font."],
    ["Nobody owns it", "If the first person contacted is teaching or asleep, nothing escalates. The report just sits there."],
    ["The reporter is left blind", "No way to tell whether help is coming, so they call again. And again."],
  ];

  const cw = (W - M * 2 - 0.26 * 2) / 3;
  items.forEach(([t, d], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = M + col * (cw + 0.26);
    const y = 1.62 + row * 1.72;
    s.addShape(pptx.ShapeType.rect, {
      x, y, w: cw, h: 1.5, fill: { color: "FFFFFF" }, line: { color: RULE, width: 1 },
    });
    s.addShape(pptx.ShapeType.rect, {
      x, y, w: cw, h: 0.045, fill: { color: ACCENT }, line: { width: 0 },
    });
    s.addText(t, {
      x: x + 0.22, y: y + 0.22, w: cw - 0.44, h: 0.3,
      fontFace: BODY, fontSize: 12.5, bold: true, color: INK,
    });
    s.addText(d, {
      x: x + 0.22, y: y + 0.54, w: cw - 0.44, h: 0.85,
      fontFace: BODY, fontSize: 10.5, color: SOFT, lineSpacing: 15, valign: "top",
    });
  });

  callout(s, "The gap we target is between “something has happened” and “the right person knows, and has confirmed they are on the way.”",
    { y: 5.62, h: 0.8 });
}

/* ═══════════════════════════════ 3 · HOW IT WORKS */
{
  const s = slide("How a report becomes a response", "End to end in under a minute");

  const steps = [
    ["Scan", "A QR code posted in the block opens the form with the location already filled in."],
    ["Report", "Pick a type, describe it by typing or voice, add a photo. Hold SOS for two seconds."],
    ["Classify", "Rule engine runs first and always. AI adds a second opinion under a 4-second timeout."],
    ["Page", "Telegram alert to the on-duty responders for that block and role."],
    ["Track", "The reporter watches the live timeline and sees an ETA once someone accepts."],
    ["Escalate", "No acknowledgement in 60 seconds? It pages the next tier by itself."],
  ];

  const bw = (W - M * 2 - 0.2 * 5) / 6;
  steps.forEach(([t, d], i) => {
    const x = M + i * (bw + 0.2);
    s.addShape(pptx.ShapeType.rect, {
      x, y: 1.35, w: bw, h: 2.5, fill: { color: SURFACE }, line: { color: RULE, width: 1 },
    });
    s.addShape(pptx.ShapeType.roundRect, {
      x: x + 0.18, y: 1.55, w: 0.38, h: 0.34, rectRadius: 0.08,
      fill: { color: ACCENT }, line: { width: 0 },
    });
    s.addText(String(i + 1), {
      x: x + 0.18, y: 1.55, w: 0.38, h: 0.34,
      fontFace: MONO, fontSize: 11, bold: true, color: "FFFFFF",
      align: "center", valign: "middle",
    });
    s.addText(t, {
      x: x + 0.18, y: 2.0, w: bw - 0.36, h: 0.32,
      fontFace: BODY, fontSize: 13, bold: true, color: INK,
    });
    s.addText(d, {
      x: x + 0.18, y: 2.34, w: bw - 0.36, h: 1.35,
      fontFace: BODY, fontSize: 9.5, color: SOFT, lineSpacing: 13.5, valign: "top",
    });

    if (i < steps.length - 1) {
      s.addText("→", {
        x: x + bw + 0.01, y: 2.4, w: 0.18, h: 0.3,
        fontFace: BODY, fontSize: 13, color: ACCENT, align: "center",
      });
    }
  });

  statTiles(s, [
    { n: "15s", l: "to file a report" },
    { n: "3", l: "escalation tiers" },
    { n: "2", l: "languages, spoken and understood" },
    { n: "0", l: "logins needed to report" },
  ], 4.25);

  callout(s, "Every step degrades gracefully: classification survives the AI being down, alerts survive a responder being offline, and the report itself survives having no network at all.",
    { y: 5.62, h: 0.8 });
}

/* ═══════════════════════════════ 4 · THE APP */
{
  const s = slide("The app", "Captured from the live deployment");

  const gap = (W - M * 2 - PH_W * 4) / 3;
  const caps = [
    ["home", "Home", "One oversized action"],
    ["report", "Report an emergency", "Location pre-filled by QR"],
    ["safewalk", "Safe Walk", "A timer that alarms on silence"],
    ["accessibility", "Accessibility", "Hindi voice, large text, contrast"],
  ];
  caps.forEach(([n, title, sub], i) => {
    const x = M + i * (PH_W + gap);
    s.addImage({ path: shot(n), x, y: 1.12, w: PH_W, h: PH_H });
    s.addText(title, {
      x: x - 0.35, y: 1.12 + PH_H + 0.12, w: PH_W + 0.7, h: 0.26,
      fontFace: BODY, fontSize: 12, bold: true, color: INK, align: "center",
    });
    s.addText(sub, {
      x: x - 0.35, y: 1.12 + PH_H + 0.4, w: PH_W + 0.7, h: 0.26,
      fontFace: BODY, fontSize: 10, color: SOFT, align: "center",
    });
  });

  s.addText(
    "Installable on iOS and Android — no app store. Anonymous reporting, optional photo evidence, and voice input for anyone who cannot type or see the screen.",
    { x: M, y: 6.5, w: W - M * 2, h: 0.4, fontFace: BODY, fontSize: 11, color: SOFT, align: "center" },
  );
}

/* ═══════════════════════════════ 5 · THE CLASSIFIER */
{
  const s = slide("The part that makes it smart", "And the part that makes it reliable");

  sectionLabel(s, "Two stages, and the rule that combines them", M, 1.1, 6.4);
  points(s, [
    { lead: "Stage 1 — rule engine.", text: "A deterministic keyword scan that always runs and cannot fail. Reads English, Hindi (Devanagari) and romanised Hinglish, so “बेहोश” and “behosh” both trigger critical." },
    { lead: "Stage 2 — AI second opinion.", text: "One prompt with the type, description, location and time, under a hard 4-second timeout. Provider swappable between OpenAI and Anthropic with one environment variable." },
    { lead: "final = MAX(rule, ai).", text: "The AI can raise a report's priority, but it can never talk the system down from a rule-matched emergency." },
  ], { x: M, y: 1.45, w: 6.4, size: 11.5, h: 3.1 });

  callout(s, "Our AI key ran out of credit mid-build. The alert still went out, correctly marked CRITICAL — because the rule engine never depended on it. That is the design working, not a lucky escape.",
    { x: M, y: 4.75, w: 6.4, h: 1.15, size: 11 });

  // Verified production output
  const bx = 7.5, bw = W - M - 7.5;
  s.addShape(pptx.ShapeType.rect, {
    x: bx, y: 1.1, w: bw, h: 4.8, fill: { color: SURFACE }, line: { color: RULE, width: 1 },
  });
  sectionLabel(s, "Real output from the deployed system", bx + 0.24, 1.3, bw - 0.48, ACCENT);
  s.addText(
    'description   "Student collapsed near the\n' +
    '               stairs and is not breathing"\n\n' +
    "rule_priority    critical\n" +
    'rule_matched     ["not breathing",\n' +
    '                  "collapsed"]\n' +
    "ai_priority      null   (429, no credit)\n" +
    "final_priority   critical\n" +
    "telegram         delivered\n\n" +
    "── same pipeline, Hindi ──────────────\n\n" +
    'description   "छात्र बेहोश है और\n' +
    '               खून बह रहा है"\n\n' +
    "rule_priority    critical\n" +
    "final_priority   critical",
    { x: bx + 0.24, y: 1.62, w: bw - 0.48, h: 4.1, fontFace: MONO, fontSize: 10.5, color: INK, lineSpacing: 15.5 },
  );
}

/* ═══════════════════════════════ 6 · RESPONDER SIDE */
{
  const s = slide("The responder side", "Where the alert actually lands");

  phone(s, "dashboard", M, 1.12, "Live incident board", 0.95);
  phone(s, "analytics", M + PH_W * 0.95 + 0.5, 1.12, "Response analytics", 0.95);

  const x0 = M + (PH_W * 0.95) * 2 + 1.15;
  points(s, [
    { lead: "Sorted by priority, then by who has waited longest.", text: "Critical cards flash and sound a looping alarm until someone acknowledges." },
    { lead: "Acknowledge captures the responder's position,", text: "so the reporter immediately sees a real distance-based ETA instead of an open-ended “on the way”." },
    { lead: "Interrupts staff on any screen.", text: "A signed-in responder gets a takeover alert and an OS notification wherever they are in the app — one tap to the incident." },
    { lead: "Duplicate grouping.", text: "Five people reporting one fire produce one alert, shown as “Confirmed by 5 people” — not five separate pages." },
    { lead: "Analytics that matter operationally:", text: "median time to acknowledge and to resolve, broken down by block, type and hour of day." },
    { lead: "QR generator built in", text: "— print every location code, four to a page, and post them around campus." },
  ], { x: x0, y: 1.12, w: W - M - x0, size: 11, h: 5.1 });
}

/* ═══════════════════════════════ 7 · WHEN THINGS GO WRONG */
{
  const s = slide("Designed for the day it fails", "Resilience and access");

  const items = [
    ["NO NETWORK", "Offline outbox", "A failed report is stored in IndexedDB and sends itself the moment signal returns."],
    ["NO DATA AT ALL", "Voice and SMS fallback", "A permanent Call Security bar and a pre-filled emergency SMS, both working on cellular voice."],
    ["SOCKET BLOCKED", "Triple-redundant sync", "Realtime, plus a resync on every reconnect, plus polling. The screen cannot silently freeze."],
    ["AI UNAVAILABLE", "Rule engine carries it", "Classification never depends on a third-party API being up or funded."],
    ["CANNOT SEE THE SCREEN", "Voice accessibility", "Status read aloud in Hindi or English, dictation instead of typing, large text and high contrast."],
    ["CANNOT ASK FOR HELP", "Safe Walk", "A missed check-in raises a critical incident automatically at the walker's last known position."],
  ];

  const cw = (W - M * 2 - 0.26 * 2) / 3;
  items.forEach(([tag, t, d], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = M + col * (cw + 0.26);
    const y = 1.12 + row * 2.24;
    s.addShape(pptx.ShapeType.rect, {
      x, y, w: cw, h: 2.0, fill: { color: "FFFFFF" }, line: { color: RULE, width: 1 },
    });
    sectionLabel(s, tag, x + 0.22, y + 0.2, cw - 0.44, ACCENT);
    s.addText(t, {
      x: x + 0.22, y: y + 0.48, w: cw - 0.44, h: 0.32,
      fontFace: BODY, fontSize: 13, bold: true, color: INK,
    });
    s.addText(d, {
      x: x + 0.22, y: y + 0.8, w: cw - 0.44, h: 1.05,
      fontFace: BODY, fontSize: 10.5, color: SOFT, lineSpacing: 15, valign: "top",
    });
  });

  s.addText("Lighthouse on the live site:  97 performance  ·  100 accessibility  ·  100 best practices  ·  100 SEO", {
    x: M, y: 5.74, w: W - M * 2, h: 0.3,
    fontFace: BODY, fontSize: 11.5, bold: true, color: GOOD, align: "center",
  });
}

/* ═══════════════════════════════ 8 · STACK + TRY IT */
{
  const s = slide("Built with, and how to try it");

  sectionLabel(s, "Stack", M, 1.1, 6.3);
  const stack = [
    ["Frontend", "Next.js 14 · TypeScript · Tailwind CSS"],
    ["Database", "Supabase PostgreSQL · Row Level Security"],
    ["Realtime", "Supabase Realtime + polling fallback"],
    ["AI", "OpenAI / Anthropic, swappable by env var"],
    ["Alerting", "Telegram Bot API, routed by block and role"],
    ["Platform", "Installable PWA, deployed on Vercel"],
  ];
  const cw = (6.3 - 0.2) / 2;
  stack.forEach(([k, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + col * (cw + 0.2), y = 1.42 + row * 0.86;
    s.addShape(pptx.ShapeType.rect, {
      x, y, w: cw, h: 0.76, fill: { color: "FFFFFF" }, line: { color: RULE, width: 1 },
    });
    sectionLabel(s, k, x + 0.16, y + 0.1, cw - 0.32, ACCENT);
    s.addText(v, {
      x: x + 0.16, y: y + 0.34, w: cw - 0.32, h: 0.36,
      fontFace: BODY, fontSize: 10.5, color: SOFT,
    });
  });

  sectionLabel(s, "Verified working, end to end", M, 4.2, 6.3);
  points(s, [
    "Rule-engine classification in English, Hindi and Hinglish",
    "Telegram alerts, three-tier auto-escalation, duplicate grouping",
    "Live tracking, responder ETA, Safe Walk, offline outbox, analytics",
    "QR deep links, anonymous reporting, photo and voice input",
  ], { x: M, y: 4.52, w: 6.3, size: 10.5, h: 1.8 });

  // Try it
  const bx = 7.4, bw = W - M - 7.4;
  s.addShape(pptx.ShapeType.rect, {
    x: bx, y: 1.1, w: bw, h: 2.75, fill: { color: WASH }, line: { width: 0 },
  });
  sectionLabel(s, "Try it in 60 seconds", bx + 0.26, 1.32, bw - 0.52, ACCENT);
  s.addText(
    "1    Open asmt-aegis.vercel.app on your phone\n" +
    "2    Tap Report, choose a type, describe it\n" +
    "3    Hold SOS for two seconds\n" +
    "4    Watch it classify and notify, live\n" +
    "5    Open /dashboard and tap Acknowledge",
    { x: bx + 0.26, y: 1.66, w: bw - 0.52, h: 2.0, fontFace: BODY, fontSize: 12, color: INK, lineSpacing: 22 },
  );

  s.addShape(pptx.ShapeType.rect, {
    x: bx, y: 4.05, w: bw, h: 2.25, fill: { color: "FFFFFF" }, line: { color: RULE, width: 1 },
  });
  sectionLabel(s, "Team Bhand Coders", bx + 0.26, 4.26, bw - 0.52);
  s.addText("Vibhor Mehta\nDevanshu Gupta\nSunny Gujjar", {
    x: bx + 0.26, y: 4.56, w: bw - 0.52, h: 1.1,
    fontFace: BODY, fontSize: 14.5, bold: true, color: INK, lineSpacing: 23,
  });
  s.addText("Anangpuria School of Management and Technology", {
    x: bx + 0.26, y: 5.72, w: bw - 0.52, h: 0.3,
    fontFace: BODY, fontSize: 10, color: SOFT,
  });
}

await pptx.writeFile({ fileName: OUT });
console.log(`wrote ${OUT}`);
