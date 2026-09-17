import type { SpeechLang } from "./a11y-settings";
import type { IncidentStatus, Priority } from "./types";

/**
 * Spoken phrases, in English and Hindi.
 *
 * Only speech is translated, not the interface. Reading an alert aloud in the
 * listener's language is what actually matters in an emergency, and a partial
 * UI translation would be worse than none.
 */

const STATUS_SPEECH: Record<SpeechLang, Record<IncidentStatus, string>> = {
  en: {
    reported: "Your report has been received.",
    classified: "Responders are being alerted.",
    acknowledged: "A responder has accepted and is on the way.",
    resolved: "This incident has been resolved.",
    cancelled: "This report was cancelled.",
  },
  hi: {
    reported: "आपकी सूचना मिल गई है।",
    classified: "जिम्मेदार कर्मचारियों को सूचित किया जा रहा है।",
    acknowledged: "एक कर्मचारी आ रहा है।",
    resolved: "यह घटना सुलझा दी गई है।",
    cancelled: "यह सूचना रद्द कर दी गई है।",
  },
};

const PRIORITY_SPEECH: Record<SpeechLang, Record<Priority, string>> = {
  en: {
    critical: "Critical priority.",
    urgent: "Urgent priority.",
    normal: "Normal priority.",
  },
  hi: {
    critical: "अति गंभीर।",
    urgent: "जरूरी।",
    normal: "सामान्य।",
  },
};

export function speakStatus(
  lang: SpeechLang,
  status: IncidentStatus,
  priority: Priority | null,
): string {
  const p = priority ? `${PRIORITY_SPEECH[lang][priority]} ` : "";
  return `${p}${STATUS_SPEECH[lang][status]}`;
}

/** Alert read to a responder when a new emergency lands. */
export function speakStaffAlert(
  lang: SpeechLang,
  priority: Priority,
  emergencyType: string,
  where: string,
): string {
  if (lang === "hi") {
    return `${PRIORITY_SPEECH.hi[priority]} ${where} पर ${emergencyType} की आपात सूचना।`;
  }
  return `${PRIORITY_SPEECH.en[priority]} ${emergencyType} emergency at ${where}.`;
}

export const VOICE_CONFIRMATION: Record<SpeechLang, string> = {
  en: "Voice announcements are on. Aegis will read status updates aloud.",
  hi: "आवाज़ सूचना चालू है। ऐजिस अब जानकारी बोलकर बताएगा।",
};

export const VOICE_TEST: Record<SpeechLang, string> = {
  en: "This is how Aegis will read alerts to you. To report an emergency, open the Report tab, choose a type, and hold the S O S button for two seconds.",
  hi: "ऐजिस इसी तरह आपको सूचना पढ़कर सुनाएगा। आपात सूचना देने के लिए रिपोर्ट टैब खोलें, प्रकार चुनें, और एस ओ एस बटन को दो सेकंड तक दबाकर रखें।",
};

export const SPEAK_INSTEAD_OF_TYPING: Record<SpeechLang, string> = {
  en: "Speak instead of typing",
  hi: "टाइप करने के बजाय बोलें",
};

export const LISTENING_LABEL: Record<SpeechLang, string> = {
  en: "Listening… tap to stop",
  hi: "सुन रहे हैं… रोकने के लिए दबाएँ",
};
