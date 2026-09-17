/**
 * Looping alert tone for unacknowledged critical incidents.
 *
 * Browsers refuse to start audio without a user gesture, and iOS is strictest
 * of all. The dashboard shows an explicit "Critical alarm" control; `arm()`
 * must be called from inside that tap.
 *
 * Two failure modes this guards against, both seen in testing:
 *  - `resume()` is asynchronous. Firing a tone immediately after it returns
 *    can land while the context is still suspended, so the sound is dropped.
 *  - iOS and Android both suspend the context when the tab is backgrounded or
 *    the screen locks, and it stays suspended on return. Every burst therefore
 *    re-checks the state instead of assuming it is still running.
 */

let ctx: AudioContext | null = null;
let timer: number | null = null;
let armed = false;

function create(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** Resumes the context if the browser parked it. Safe to call often. */
async function ensureRunning(): Promise<AudioContext | null> {
  const audio = create();
  if (!audio) return null;
  if (audio.state === "suspended") {
    try {
      await audio.resume();
    } catch {
      return null;
    }
  }
  return audio.state === "running" ? audio : null;
}

function tone(audio: AudioContext, freq: number, offset: number, duration = 0.26) {
  try {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime + offset;
    const end = start + duration;
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  } catch {
    /* ignore */
  }
}

async function burst() {
  const audio = await ensureRunning();
  if (!audio) return;
  // Two-tone "nee-naw" so it reads as an alarm, not a notification.
  tone(audio, 880, 0);
  tone(audio, 660, 0.28);
}

/**
 * Call from a user gesture to unlock playback. Plays a short confirmation
 * chirp so the user gets immediate proof that sound works on their device,
 * rather than silence until the first critical incident arrives.
 */
export async function arm(): Promise<boolean> {
  // Created synchronously inside the gesture; iOS requires that.
  const audio = create();
  if (!audio) {
    armed = false;
    return false;
  }
  const running = await ensureRunning();
  armed = Boolean(running);
  if (running) {
    tone(running, 660, 0, 0.12);
    tone(running, 990, 0.14, 0.16);
  }
  return armed;
}

export function isArmed() {
  return armed;
}

/** Starts the repeating alarm. Safe to call repeatedly. */
export function start() {
  if (!armed || timer !== null) return;
  void burst();
  timer = window.setInterval(() => void burst(), 1600);
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

/**
 * Re-resumes audio when the user comes back to the tab. Without this the
 * alarm goes permanently silent after a screen lock.
 */
export function watchVisibility(): () => void {
  if (typeof document === "undefined") return () => {};
  const onVisible = () => {
    if (document.visibilityState === "visible" && armed && timer !== null) {
      void ensureRunning();
    }
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => document.removeEventListener("visibilitychange", onVisible);
}
