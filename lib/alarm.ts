/**
 * Looping alert tone for unacknowledged critical incidents.
 *
 * Browsers refuse to start audio without a user gesture, and iOS is strictest
 * of all. The dashboard therefore shows an explicit "Enable alarm" control;
 * `arm()` must be called from inside that tap.
 */

let ctx: AudioContext | null = null;
let timer: number | null = null;
let armed = false;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a user gesture to unlock audio playback. */
export function arm(): boolean {
  const audio = context();
  armed = Boolean(audio);
  return armed;
}

export function isArmed() {
  return armed;
}

function burst() {
  const audio = context();
  if (!audio) return;
  // Two-tone "nee-naw" so it reads as an alarm, not a notification.
  const pattern: [number, number][] = [
    [880, 0],
    [660, 0.28],
  ];
  for (const [freq, offset] of pattern) {
    try {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + offset;
      const end = start + 0.26;
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    } catch {
      /* ignore */
    }
  }
}

/** Starts the repeating alarm. Safe to call repeatedly. */
export function start() {
  if (!armed || timer !== null) return;
  burst();
  timer = window.setInterval(burst, 1600);
}

export function stop() {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

export function isPlaying() {
  return timer !== null;
}
