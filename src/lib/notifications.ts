/**
 * Notification dispatch — server-only.
 *
 * Writes a row to sol_notifications (in-app), and if the recipient has
 * subscribed via email and the type is enabled in their prefs, also fires
 * an email through Resend.
 */

import { Resend } from "resend";
import { isSupabaseConfigured, supabaseAdmin } from "./supabase-server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Foundation <notifications@fdnusd.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://fdnusd.com";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export type NotificationType =
  | "apy_change"
  | "deposit"
  | "withdrawal"
  | "vault_launch"
  | "weekly_digest"
  | "system";

export interface NotifyParams {
  /** Recipient wallet. Pass null for broadcasts (notifies all subscribers with the type enabled). */
  wallet: string | null;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
  /** Skip the email even if the user has the type enabled. */
  noEmail?: boolean;
}

const PREF_KEY: Record<NotificationType, string> = {
  apy_change: "apy_change",
  deposit: "deposits",
  withdrawal: "withdrawals",
  vault_launch: "vault_launches",
  weekly_digest: "weekly_digest",
  system: "apy_change", // system messages piggyback on apy_change pref for now
};

/**
 * Persist + dispatch a notification. Returns the inserted row id (or null on
 * supabase outage — we never throw to keep the caller's main flow alive).
 */
export async function notify(params: NotifyParams): Promise<number | null> {
  if (!isSupabaseConfigured()) {
    console.warn("notify: supabase not configured, skipping");
    return null;
  }

  const { wallet, type, title, body, link, metadata } = params;

  // 1. Insert in-app notification
  const { data, error } = await supabaseAdmin
    .from("sol_notifications")
    .insert({ wallet, type, title, body: body || null, link: link || null, metadata: metadata || {} })
    .select("id")
    .single();

  if (error) {
    console.error("notify insert failed:", error);
    return null;
  }
  const id = data.id;

  // 2. Email (best-effort, doesn't block)
  if (!params.noEmail && resend) {
    sendEmailFor(id, params).catch((e) => console.error("notify email failed:", e));
  }
  return id;
}

async function sendEmailFor(notificationId: number, params: NotifyParams) {
  if (!resend || !isSupabaseConfigured()) return;

  // Find recipients: explicit wallet → look up subscriber; null wallet → broadcast.
  const prefKey = PREF_KEY[params.type];

  let recipients: Array<{ email: string; unsubscribe_token: string | null }> = [];
  if (params.wallet) {
    const { data } = await supabaseAdmin
      .from("sol_subscribers")
      .select("email,prefs,unsubscribe_token,verified_at")
      .eq("wallet", params.wallet)
      .not("verified_at", "is", null);
    recipients = (data ?? [])
      .filter((s) => (s.prefs as Record<string, boolean>)?.[prefKey] !== false)
      .map((s) => ({ email: s.email, unsubscribe_token: s.unsubscribe_token }));
  } else {
    const { data } = await supabaseAdmin
      .from("sol_subscribers")
      .select("email,prefs,unsubscribe_token,verified_at")
      .not("verified_at", "is", null);
    recipients = (data ?? [])
      .filter((s) => (s.prefs as Record<string, boolean>)?.[prefKey] !== false)
      .map((s) => ({ email: s.email, unsubscribe_token: s.unsubscribe_token }));
  }

  if (recipients.length === 0) return;

  await Promise.all(
    recipients.map(async (r) => {
      try {
        await resend!.emails.send({
          from: EMAIL_FROM,
          to: r.email,
          subject: params.title,
          html: renderEmailHtml({
            title: params.title,
            body: params.body || "",
            link: params.link,
            unsubscribeToken: r.unsubscribe_token || undefined,
          }),
        });
      } catch (e) {
        console.error(`notify: send to ${r.email} failed:`, e);
      }
    }),
  );

  await supabaseAdmin
    .from("sol_notifications")
    .update({ emailed_at: new Date().toISOString() })
    .eq("id", notificationId);
}

interface EmailRenderParams {
  title: string;
  body: string;
  link?: string;
  unsubscribeToken?: string;
}

function renderEmailHtml(p: EmailRenderParams): string {
  const unsub = p.unsubscribeToken
    ? `${APP_URL}/api/subscribers/unsubscribe?t=${encodeURIComponent(p.unsubscribeToken)}`
    : `${APP_URL}`;
  const cta = p.link
    ? `<a href="${escapeHtml(p.link)}" style="display:inline-block;margin-top:16px;background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-family:ui-monospace,monospace;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;">View on Foundation →</a>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f7f9;font-family:ui-sans-serif,system-ui,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 28px 0 28px;">
          <div style="font-family:ui-serif,Georgia,serif;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#b8960c;">Foundation<span style="color:#0f172a;">.</span></div>
        </td></tr>
        <tr><td style="padding:14px 28px 4px 28px;">
          <h1 style="margin:0;font-family:ui-serif,Georgia,serif;font-weight:300;font-size:24px;line-height:1.25;color:#0f172a;">${escapeHtml(p.title)}</h1>
        </td></tr>
        <tr><td style="padding:8px 28px 24px 28px;">
          <p style="margin:0;font-size:14px;line-height:1.55;color:#334155;">${escapeHtml(p.body).replace(/\n/g, "<br>")}</p>
          ${cta}
        </td></tr>
        <tr><td style="padding:18px 28px 22px 28px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;">
          You're receiving this because you subscribed at <a href="${APP_URL}" style="color:#0f172a;">${APP_URL.replace(/^https?:\/\//, "")}</a>.<br>
          <a href="${unsub}" style="color:#64748b;">Unsubscribe</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send a verification email — a different shape than dispatch (no notification
 * row, no unsubscribe-token gate since user isn't verified yet).
 */
export async function sendVerificationEmail(params: { email: string; verifyToken: string }) {
  if (!resend) {
    console.warn("sendVerificationEmail: RESEND_API_KEY not set, skipping");
    return;
  }
  const verifyUrl = `${APP_URL}/api/subscribers/verify?t=${encodeURIComponent(params.verifyToken)}`;
  await resend.emails.send({
    from: EMAIL_FROM,
    to: params.email,
    subject: "Confirm your Foundation subscription",
    html: renderEmailHtml({
      title: "One last step — confirm your email",
      body:
        "Click the button below to start receiving Foundation updates: significant APY changes, your deposit and withdrawal confirmations, and new vault launches.\n\nIf you didn't request this, you can ignore this email.",
      link: verifyUrl,
    }),
  });
}
