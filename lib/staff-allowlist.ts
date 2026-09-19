import "server-only";

/**
 * Who may become staff via the magic-link path.
 *
 * /api/staff/sso previously verified only that Supabase had issued a session
 * for *some* email - it never checked that the email belonged to campus
 * staff. Supabase magic-link sign-up is open by default (anyone can request
 * a link for any address), so that route let any person in the world type
 * their own email, click the link Supabase sent them, and mint a full staff
 * session with no relationship to the college at all.
 *
 * This closes that gap with two independent, additive controls:
 *   - STAFF_EMAIL_DOMAIN: accept any address on the campus domain.
 *   - STAFF_EMAIL_ALLOWLIST: comma-separated exact addresses, for an admin
 *     whose mailbox is not on that domain.
 *
 * If neither is configured, the path fails closed rather than silently
 * accepting everyone - the PIN path (lib/staff-auth.ts) remains fully
 * functional either way, so this cannot lock staff out of the dashboard.
 */
export function isAuthorizedStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalised = email.trim().toLowerCase();

  const domain = process.env.STAFF_EMAIL_DOMAIN?.trim().toLowerCase();
  if (domain && normalised.endsWith(`@${domain}`)) return true;

  const allowlist = (process.env.STAFF_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.includes(normalised)) return true;

  return false;
}

export function staffEmailControlsConfigured(): boolean {
  return Boolean(
    process.env.STAFF_EMAIL_DOMAIN?.trim() || process.env.STAFF_EMAIL_ALLOWLIST?.trim(),
  );
}
