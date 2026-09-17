/**
 * Cross-platform tactile/audible feedback.
 *
 * Android: the Vibration API works, so we use it.
 * iOS: navigator.vibrate does not exist at all, and WebAudio is suspended
 * until a user gesture resumes it. Every function here is therefore safe to
 * call directly from a touch handler and must not be deferred behind an
 * await or a timeout, or iOS will silently drop the sound.
 */

let ctx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    // Safari parks the context in "suspended" until a gesture resumes it.
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Call once from the first user gesture (e.g. pointerdown on the SOS button)
 * so later programmatic beeps are allowed to play on iOS.
 */
export function primeAudio(): void {
  getAudioContext();
}

/** Short tone. `when` is an offset in seconds from now. */
function tone(freq: number, durationMs: number, when = 0, gain = 0.18): void {
  const audio = getAudioContext();
  if (!audio) return;
  try {
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    const start = audio.currentTime + when;
    const end = start + durationMs / 1000;

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);

    // Ramp the envelope; a hard stop produces an audible click.
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(amp);
    amp.connect(audio.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  } catch {
    // Audio is a nicety; never let it break a report.
  }
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  try {
    // Absent on iOS Safari entirely.
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

/** Light tick while the SOS hold is charging. */
export function feedbackTick(): void {
  vibrate(10);
  tone(880, 40, 0, 0.06);
}

/** Fired the moment a hold-to-confirm completes and the report is sent. */
export function feedbackConfirm(): void {
  vibrate([50, 40, 80]);
  // Rising two-tone chime reads as "sent" on a noisy campus.
  tone(660, 120, 0);
  tone(990, 180, 0.12);
}

/** The hold was released early. */
export function feedbackCancel(): void {
  vibrate(20);
  tone(420, 110, 0, 0.1);
}

/** Something failed (offline, insert rejected). */
export function feedbackError(): void {
  vibrate([60, 60, 60]);
  tone(320, 150, 0);
  tone(240, 200, 0.14);
}
