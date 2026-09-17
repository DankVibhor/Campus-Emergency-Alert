/**
 * Per-device accessibility preferences.
 *
 * Deliberately local and account-free: reporting is anonymous, so a blind
 * student must be able to set these up once on their own phone without
 * signing in anywhere.
 */

const KEY = "aegis.a11y.v1";

/** Spoken/dictated language. The interface itself stays in English. */
export type SpeechLang = "en" | "hi";

export const SPEECH_LOCALES: Record<SpeechLang, string> = {
  en: "en-IN",
  hi: "hi-IN",
};

export interface A11ySettings {
  /** Read status changes and confirmations aloud. */
  voice: boolean;
  /** Larger base text throughout the app. */
  largeText: boolean;
  /** Stronger borders and darker secondary text. */
  highContrast: boolean;
  /** Language used for speaking and for voice dictation. */
  language: SpeechLang;
}

export const DEFAULT_SETTINGS: A11ySettings = {
  voice: false,
  largeText: false,
  highContrast: false,
  language: "en",
};

export function readSettings(): A11ySettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<A11ySettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(settings: A11ySettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  applySettings(settings);
}

/** Reflects settings onto <html> so CSS can react to them. */
export function applySettings(settings: A11ySettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("a11y-large-text", settings.largeText);
  root.classList.toggle("a11y-high-contrast", settings.highContrast);
}
