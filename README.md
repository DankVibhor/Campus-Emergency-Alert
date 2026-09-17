# ASMT Aegis — Campus Emergency Response System

Anangpuria School of Management and Technology · A.S.M.T. Hackathon 2K26

**Live:** https://asmt-aegis.vercel.app
**Staff PIN:** `AEGIS2026`

A phone-first emergency reporting system for a three-block campus. A student
scans a QR code posted on the wall, describes what is happening, and holds one
button. Within seconds the report is classified for urgency, the on-duty
responder is paged on Telegram, and the reporter watches the response happen
live. If nobody acknowledges a critical incident in 60 seconds, it escalates
itself.

---

## 60-second demo script

> Have two devices ready: a **phone** (reporter) and a **laptop** (responder
> dashboard). Open the Telegram group where the bot posts so alerts are visible.

| # | Time | Do this | What the judge sees |
|---|------|---------|---------------------|
| 1 | 0:00 | Scan a printed QR code with the phone camera | Report form opens with **block and floor already filled in** — no typing |
| 2 | 0:10 | Tap **Fire**, type "smoke from the electrical room, someone collapsed" | Emergency type grid, 2 columns, thumb-reachable |
| 3 | 0:20 | **Hold the SOS button for 2 seconds** | Red ring fills around the button, phone buzzes (Android) / beeps + pulses (iOS) |
| 4 | 0:25 | — | Redirects to the live status page. A **"Cancel — false alarm"** button counts down for 10s |
| 5 | 0:30 | Show the Telegram group | 🔴 **CRITICAL EMERGENCY** alert with location, description and a link |
| 6 | 0:35 | Switch to the laptop dashboard | The incident **appeared by itself** (realtime), card flashing red, alarm sounding |
| 7 | 0:45 | Point at the countdown on the card | *"Escalates in 23s"* — if no one responds it pages the next tier automatically |
| 8 | 0:50 | Tap **Acknowledge** | Flashing stops, alarm stops, and the **phone updates instantly** without a refresh |
| 9 | 0:55 | Back on the phone, show the timeline | Reported → Classified → Notified → Acknowledged, each timestamped |

**The line to close on:** every step degraded gracefully. Classification works
with the AI provider down, alerts work with one responder offline, and the
report itself survives having no network at all.

---

## What makes it more than a form

- **Two-stage classification.** A deterministic keyword engine runs first and
  always succeeds. An LLM is then asked for a second opinion under a 4-second
  timeout. The final priority is the **more severe of the two**, so the AI can
  escalate an incident but can never talk the system down from a rule-matched
  emergency. If the AI key is dead, expired or slow, classification still works.
- **Auto-escalation.** Critical incidents unacknowledged for 60s page tier 2
  (security → warden), then tier 3 (warden → admin). Each tier is recorded in
  `escalations` and notified exactly once, so several open dashboards cannot
  double-page anyone.
- **Offline outbox.** If the insert fails, the report goes into IndexedDB and
  sends itself when connectivity returns. The user gets "Saved — will send when
  online", plus a `tel:` and a **pre-filled SMS** that work on cellular voice
  with no data.
- **Anonymous by design.** Reporting needs no account. Harassment can be
  reported anonymously while responders still get the exact location.

---

## Architecture

```
QR code  ──►  /report?campus=…&location=…
                 │  anon insert (RLS)
                 ▼
            incidents ──► /api/classify ──► rule engine  (always)
                 │                      └─► LLM         (4s timeout)
                 │                              │
                 │                       final = MAX(rule, ai)
                 │                              │
                 │                              ├─► Telegram Bot API
                 │                              └─► incident_events
                 ▼
         Supabase Realtime ──► reporter's status page
                            └─► responder dashboard ──► /api/escalate (15s sweep)
```

**Stack:** Next.js 14 (App Router, TypeScript) · Supabase (Postgres, Realtime,
Auth, RLS) · TailwindCSS · Framer Motion · Telegram Bot API · OpenAI/Anthropic
(swappable) · deployed as an installable PWA on Vercel.

---

## Cross-platform notes

Built and tested against iOS Safari and Chrome Android, installed and in-browser.

- `env(safe-area-inset-*)` on every screen — clears the iPhone notch and the
  Android gesture bar.
- **iOS has no Vibration API**, so SOS confirmation uses a visual pulse plus a
  WebAudio beep. Audio is unlocked from inside the tap handler, since iOS
  refuses to play sound that did not originate in a user gesture.
- `100dvh` with a `-webkit-fill-available` fallback — plain `100vh` is wrong on
  iOS Safari.
- Native `<select>` elements, so each platform renders its own picker.
- No hover states anywhere; `:active` and `:focus-visible` only.
- 48px minimum touch targets; the SOS button is 224px.
- System font stack — no webfont request on the critical path.

---

## Database

Six tables: `campuses`, `locations`, `responders`, `incidents`,
`incident_events`, `escalations`. Realtime is enabled on `incidents` and
`incident_events`, both with `replica identity full` so UPDATE payloads carry
the whole row.

**Row Level Security**

| Table | anon | authenticated |
|---|---|---|
| `campuses`, `locations` | read | read |
| `incidents` | insert + read | read + update |
| `incident_events` | insert + read | insert + read |
| `responders` | **no access** | read |

`responders` holds staff phone numbers and Telegram chat IDs, so it is the one
table anonymous users cannot read. Responder actions (acknowledge, resolve,
cancel) go through server routes holding the service-role key, which keeps
write authority off the client entirely.

Schema and seed: [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
Re-runnable — it drops and recreates everything, then seeds 3 blocks, 12
locations and 12 responders.

---

## Environment variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # server only, never NEXT_PUBLIC_

AI_PROVIDER=openai                              # or "anthropic"
OPENAI_API_KEY=<key>
ANTHROPIC_API_KEY=<key>

TELEGRAM_BOT_TOKEN=<bot token>
TELEGRAM_ADMIN_CHAT_ID=<group chat id, negative for supergroups>

STAFF_PIN=AEGIS2026
NEXT_PUBLIC_SECURITY_PHONE=+919999999999
NEXT_PUBLIC_SITE_URL=https://asmt-aegis.vercel.app
```

`NEXT_PUBLIC_SITE_URL` matters: QR codes encode it. Per-deployment Vercel URLs
sit behind SSO, so a code pointing at one would hand the judge a login wall.

## Run locally

```bash
npm install
cp .env.local.example .env.local   # then fill in the values above
npm run dev                        # http://localhost:3000
```

Run `supabase/migrations/0001_init.sql` in the Supabase SQL editor first.

## Printing the QR codes

Open [`/admin/qr`](https://asmt-aegis.vercel.app/admin/qr) and hit **Print all
QR codes**. Four per row on A4, each captioned with its block and floor. Print
styles hide the navigation and the Call Security button.

---

## Known limitations

- **Escalation is dashboard-driven.** The sweep runs every 15s from any open
  dashboard rather than from a server cron, so escalation pauses if no
  dashboard is open. A Vercel Cron hitting `/api/escalate` is the production
  fix; this was the right trade for a timeboxed build.
- **The staff PIN is shared.** Magic-link email auth is wired up and works, but
  Supabase rate-limits auth mail on the free tier, so the PIN exists as a
  demo-safe path. Real deployment should be magic-link only.
- **The campus map is a schematic**, not a real map. Three adjacent buildings
  render more legibly as a diagram than as a zoomed tile map, and it costs no
  network request.
