import type { Priority } from "./types";

/**
 * Telegram Bot API wrapper. Every function swallows its errors: a failed
 * notification must never roll back an incident that was recorded correctly.
 */

const API = "https://api.telegram.org";

export interface NotifyTarget {
  chatId: string;
  label: string;
}

/** Roles paged first, in escalation order. */
export const ESCALATION_TIERS: Record<number, string[]> = {
  1: ["medical", "security"],
  2: ["security", "warden"],
  3: ["warden", "admin"],
};

const PRIORITY_EMOJI: Record<Priority, string> = {
  critical: "🔴",
  urgent: "🟠",
  normal: "🟢",
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface AlertMessageInput {
  priority: Priority;
  emergencyType: string;
  campusName: string;
  locationLabel: string;
  description: string | null;
  reporter: string;
  reasoning: string | null;
  incidentUrl: string;
  tier?: number;
  elapsedSeconds?: number;
}

export function buildAlertMessage(i: AlertMessageInput): string {
  const head =
    i.tier && i.tier > 1
      ? `${PRIORITY_EMOJI[i.priority]} <b>ESCALATION — TIER ${i.tier}</b>`
      : `${PRIORITY_EMOJI[i.priority]} <b>${i.priority.toUpperCase()} EMERGENCY</b>`;

  const lines = [
    head,
    "",
    `<b>Type:</b> ${escapeHtml(i.emergencyType)}`,
    `<b>Where:</b> ${escapeHtml(i.campusName)} — ${escapeHtml(i.locationLabel)}`,
  ];

  if (i.description) {
    lines.push(`<b>Details:</b> ${escapeHtml(i.description)}`);
  }
  lines.push(`<b>Reported by:</b> ${escapeHtml(i.reporter)}`);

  if (i.reasoning) {
    lines.push(`<b>Assessment:</b> ${escapeHtml(i.reasoning)}`);
  }
  if (typeof i.elapsedSeconds === "number") {
    lines.push(
      `<b>Unacknowledged for:</b> ${Math.round(i.elapsedSeconds)}s`,
    );
  }

  lines.push("", `<a href="${i.incidentUrl}">Open incident →</a>`);
  return lines.join("\n");
}

export interface SendResult {
  ok: boolean;
  chatId: string;
  error?: string;
}

export async function sendTelegramMessage(
  chatId: string,
  html: string,
): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { ok: false, chatId, error: "TELEGRAM_BOT_TOKEN not configured" };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, chatId, error: `${res.status}: ${body.slice(0, 160)}` };
    }
    return { ok: true, chatId };
  } catch (err) {
    return {
      ok: false,
      chatId,
      error: err instanceof Error ? err.message : "send failed",
    };
  }
}

/** Fans a message out to every target plus the admin fallback group. */
export async function broadcast(
  targets: NotifyTarget[],
  html: string,
): Promise<SendResult[]> {
  const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID;

  const chatIds = new Set<string>();
  for (const t of targets) {
    if (t.chatId) chatIds.add(t.chatId);
  }
  // The admin group always gets a copy so nothing is silently missed.
  if (adminChat) chatIds.add(adminChat);

  if (chatIds.size === 0) {
    return [{ ok: false, chatId: "(none)", error: "no telegram recipients configured" }];
  }

  return Promise.all(
    Array.from(chatIds).map((id) => sendTelegramMessage(id, html)),
  );
}
