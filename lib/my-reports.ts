/**
 * Remembers which incidents were filed from this device so the Status tab can
 * show them. Anonymous reports have no account to hang them off, so this is
 * deliberately local-only and never leaves the browser.
 */

const KEY = "aegis.my-reports";
const LIMIT = 40;

export interface MyReport {
  id: string;
  emergencyType: string;
  createdAt: string;
}

function read(): MyReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MyReport[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Private mode, blocked storage, or corrupt JSON.
    return [];
  }
}

function write(items: MyReport[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, LIMIT)));
  } catch {
    /* storage full or unavailable - not fatal */
  }
}

export function rememberReport(report: MyReport) {
  const existing = read().filter((r) => r.id !== report.id);
  write([report, ...existing]);
}

export function listReports(): MyReport[] {
  return read();
}

export function forgetReports() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
