"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { canListen, startDictation, type Dictation } from "@/lib/speech";
import {
  SPEECH_LOCALES,
  readSettings,
  type SpeechLang,
} from "@/lib/a11y-settings";
import { LISTENING_LABEL, SPEAK_INSTEAD_OF_TYPING } from "@/lib/phrases";

interface Props {
  /** Receives the transcript as the user speaks. */
  onText: (text: string) => void;
  /** Text already in the field, so dictation appends instead of replacing. */
  existing: string;
}

/**
 * Microphone button for hands-free reporting — useful for a blind user, and
 * for anyone whose hands are busy dealing with the actual emergency.
 *
 * Renders nothing where SpeechRecognition is unavailable (notably iOS Safari)
 * rather than showing a button that would do nothing when tapped.
 */
export default function VoiceInput({ onText, existing }: Props) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<SpeechLang>("en");
  const sessionRef = useRef<Dictation | null>(null);
  const baseRef = useRef("");

  // Feature detection must run client-side to avoid a hydration mismatch.
  useEffect(() => {
    setSupported(canListen());
    setLang(readSettings().language);
  }, []);

  useEffect(
    () => () => {
      sessionRef.current?.stop();
    },
    [],
  );

  const stop = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    setError(null);
    baseRef.current = existing.trim();
    const settings = readSettings();
    setLang(settings.language);

    const session = startDictation({
      lang: SPEECH_LOCALES[settings.language],
      onText: (text) => {
        const prefix = baseRef.current ? `${baseRef.current} ` : "";
        onText(`${prefix}${text}`);
      },
      onError: (message) => {
        setError(message);
        setListening(false);
      },
      onEnd: () => {
        sessionRef.current = null;
        setListening(false);
      },
    });

    if (session) {
      sessionRef.current = session;
      setListening(true);
    }
  }, [existing, onText]);

  if (!supported) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={listening ? stop : start}
        aria-pressed={listening}
        aria-label={
          listening ? "Stop voice input" : "Describe the emergency by voice"
        }
        className={`tap flex items-center justify-center gap-2 rounded-2xl border-2 px-5 py-3 font-bold active:bg-slate-100 ${
          listening
            ? "animate-aegis-pulse border-red-600 bg-red-50 text-red-700"
            : "border-slate-300 bg-white text-slate-800"
        }`}
      >
        {listening ? (
          <Square size={18} aria-hidden="true" />
        ) : (
          <Mic size={18} aria-hidden="true" />
        )}
        {listening ? LISTENING_LABEL[lang] : SPEAK_INSTEAD_OF_TYPING[lang]}
      </button>

      <span className="sr-only" aria-live="polite">
        {listening ? "Listening" : ""}
      </span>

      {error ? (
        <p className="text-sm font-medium text-amber-700">{error}</p>
      ) : null}
    </div>
  );
}
