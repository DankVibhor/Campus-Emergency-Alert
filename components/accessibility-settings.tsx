"use client";

import { useEffect, useState } from "react";
import { Contrast, Languages, Mic, Type, Volume2 } from "lucide-react";
import {
  DEFAULT_SETTINGS,
  SPEECH_LOCALES,
  readSettings,
  writeSettings,
  type A11ySettings,
} from "@/lib/a11y-settings";
import { VOICE_CONFIRMATION, VOICE_TEST } from "@/lib/phrases";
import { canListen, canSpeak, primeSpeech, speak, stopSpeaking } from "@/lib/speech";

export default function AccessibilitySettings() {
  const [settings, setSettings] = useState<A11ySettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [listenSupported, setListenSupported] = useState(true);

  useEffect(() => {
    setSettings(readSettings());
    setSpeechSupported(canSpeak());
    setListenSupported(canListen());
    setReady(true);
  }, []);

  function update(patch: Partial<A11ySettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    writeSettings(next);

    // Turning voice on must speak immediately: this tap is the user gesture
    // iOS requires, and it proves to a blind user that it worked.
    if (patch.voice === true) {
      primeSpeech();
      speak(VOICE_CONFIRMATION[next.language], { interrupt: true });
    }
    if (patch.voice === false) stopSpeaking();

    // Changing language should demonstrate the new voice straight away.
    if (patch.language && next.voice) {
      primeSpeech();
      speak(VOICE_CONFIRMATION[patch.language], {
        interrupt: true,
        lang: SPEECH_LOCALES[patch.language],
      });
    }
  }

  if (!ready) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Language */}
      <div className="rounded-2xl border-2 border-slate-200 px-4 py-4">
        <p className="flex items-center gap-2 text-base font-bold text-slate-900">
          <Languages size={22} className="text-red-600" aria-hidden="true" />
          Voice language / आवाज़ की भाषा
        </p>
        <p className="mt-1 text-sm leading-snug text-slate-600">
          Used for reading alerts aloud and for voice input.
        </p>
        <div className="mt-3 flex gap-2">
          {(
            [
              { value: "en", label: "English" },
              { value: "hi", label: "हिन्दी" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={settings.language === option.value}
              onClick={() => update({ language: option.value })}
              className={`tap flex-1 rounded-xl border-2 px-4 py-3 text-base font-bold active:bg-slate-100 ${
                settings.language === option.value
                  ? "border-red-600 bg-red-50 text-red-700"
                  : "border-slate-300 bg-white text-slate-800"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <Toggle
        icon={<Volume2 size={22} aria-hidden="true" />}
        title="Voice announcements"
        description={
          speechSupported
            ? "Read status updates and confirmations aloud."
            : "This browser does not support speech output."
        }
        checked={settings.voice}
        disabled={!speechSupported}
        onChange={(v) => update({ voice: v })}
      />

      <Toggle
        icon={<Type size={22} aria-hidden="true" />}
        title="Larger text"
        description="Increase text size across the whole app."
        checked={settings.largeText}
        onChange={(v) => update({ largeText: v })}
      />

      <Toggle
        icon={<Contrast size={22} aria-hidden="true" />}
        title="High contrast"
        description="Darker text and stronger borders."
        checked={settings.highContrast}
        onChange={(v) => update({ highContrast: v })}
      />

      <div className="mt-2 rounded-2xl bg-slate-50 px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Mic size={16} aria-hidden="true" />
          Voice reporting
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          {listenSupported
            ? "On the Report screen, tap “Speak instead of typing” to describe the emergency with your voice."
            : "Voice input is not available in this browser. It works in Chrome on Android. You can still report using the emergency type buttons without typing anything."}
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          primeSpeech();
          speak(VOICE_TEST[settings.language], { interrupt: true });
        }}
        disabled={!speechSupported}
        className="tap rounded-2xl border-2 border-slate-300 px-6 py-4 text-base font-bold text-slate-900 active:bg-slate-100 disabled:opacity-50"
      >
        Test the voice
      </button>
    </div>
  );
}

function Toggle({
  icon,
  title,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="tap flex items-center justify-between gap-3 rounded-2xl border-2 border-slate-200 px-4 py-4 text-left active:bg-slate-100 disabled:opacity-50"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-red-600">{icon}</span>
        <span className="min-w-0">
          <span className="block text-base font-bold text-slate-900">{title}</span>
          <span className="block text-sm leading-snug text-slate-600">
            {description}
          </span>
        </span>
      </span>
      <span
        className={`flex h-8 w-14 shrink-0 items-center rounded-full px-1 transition-colors ${
          checked ? "bg-green-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`h-6 w-6 rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
