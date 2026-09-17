/**
 * Speech input and output.
 *
 * Support is uneven and must be feature-detected, never assumed:
 *  - SpeechSynthesis (speaking): iOS Safari and Chrome Android both support it,
 *    but iOS only speaks if the first utterance follows a user gesture.
 *  - SpeechRecognition (listening): Chrome/Android and desktop Chrome only.
 *    iOS Safari does not implement it at all, so the UI must hide the control
 *    rather than offer a button that silently does nothing.
 *
 * Both honour the saved language preference, so a student more fluent in Hindi
 * can dictate in Hindi and hear updates read back in Hindi.
 */

import { SPEECH_LOCALES, readSettings } from "./a11y-settings";

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

let unlocked = false;

/** Call from a user gesture once, so iOS allows later programmatic speech. */
export function primeSpeech(): void {
  if (!canSpeak() || unlocked) return;
  try {
    // A near-silent empty utterance is enough to satisfy the gesture rule.
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
    unlocked = true;
  } catch {
    /* ignore */
  }
}

export interface SpeakOptions {
  /** Cancel anything currently being spoken first. */
  interrupt?: boolean;
  rate?: number;
  /** BCP-47 tag, e.g. "hi-IN". Defaults to the saved preference. */
  lang?: string;
}

/** Picks an installed voice for the locale, falling back to the language. */
function voiceFor(lang: string): SpeechSynthesisVoice | undefined {
  try {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return undefined;
    const base = lang.split("-")[0];
    return (
      voices.find((v) => v.lang === lang) ??
      voices.find((v) => v.lang.replace("_", "-").startsWith(base))
    );
  } catch {
    return undefined;
  }
}

export function speak(text: string, options: SpeakOptions = {}): void {
  if (!canSpeak() || !text.trim()) return;
  try {
    const synth = window.speechSynthesis;
    if (options.interrupt) synth.cancel();

    const lang = options.lang ?? SPEECH_LOCALES[readSettings().language];
    const u = new SpeechSynthesisUtterance(text);
    // Slightly slower than default: this is used for emergency information.
    u.rate = options.rate ?? 0.95;
    u.pitch = 1;
    u.lang = lang;

    // Without an explicit voice, some Android builds read Devanagari with an
    // English voice, which is unintelligible.
    const match = voiceFor(lang);
    if (match) u.voice = match;

    synth.speak(u);
  } catch {
    /* speech is an enhancement, never a dependency */
  }
}

export function stopSpeaking(): void {
  if (!canSpeak()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string }> & { isFinal: boolean }
  >;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canListen(): boolean {
  return recognitionCtor() !== null;
}

export interface Dictation {
  stop: () => void;
}

/**
 * Starts dictation. `onText` receives the transcript so far (interim results
 * included) so the textarea fills in as the user speaks.
 */
export function startDictation(handlers: {
  onText: (text: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
  /** BCP-47 tag. Defaults to the saved language preference. */
  lang?: string;
}): Dictation | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;

  try {
    const rec = new Ctor();
    rec.lang = handlers.lang ?? SPEECH_LOCALES[readSettings().language];
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event) => {
      let text = "";
      let isFinal = false;
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        text += result[0]?.transcript ?? "";
        if (result.isFinal) isFinal = true;
      }
      handlers.onText(text.trim(), isFinal);
    };

    rec.onerror = (e) => {
      const code = e.error ?? "unknown";
      const message =
        code === "not-allowed" || code === "service-not-allowed"
          ? "Microphone permission was denied."
          : code === "no-speech"
            ? "No speech detected. Try again."
            : `Voice input failed (${code}).`;
      handlers.onError?.(message);
    };

    rec.onend = () => handlers.onEnd?.();

    rec.start();
    return { stop: () => rec.stop() };
  } catch {
    handlers.onError?.("Voice input could not start on this device.");
    return null;
  }
}
