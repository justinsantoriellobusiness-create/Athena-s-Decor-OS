/**
 * Outbound email delivery via Resend (https://resend.com). Requires
 * RESEND_API_KEY. The `from` address's domain must be verified with Resend
 * before it can send to arbitrary recipients — until then Resend will
 * reject sends, which surfaces here as a normal error result rather than
 * a thrown exception, so callers can record per-recipient bounces.
 */
import { ENV } from "./env";

export type SendEmailOptions = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { success: true; id: string }
  | { success: false; error: string };

export function isEmailConfigured(): boolean {
  return Boolean(ENV.resendApiKey);
}

// HTTP header values must be Latin-1 (byte values 0-255). If RESEND_API_KEY
// was copy-pasted from a PDF/webpage/notes app that silently swapped in a
// "smart" character (curly quote, en-dash, bullet, etc.), the raw fetch()
// call throws a cryptic "Cannot convert argument to a ByteString" — this
// catches that upfront with an actionable message instead.
function findInvalidHeaderChar(value: string): { index: number; code: number } | null {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 255) return { index: i, code };
  }
  return null;
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  if (!ENV.resendApiKey) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }
  const badChar = findInvalidHeaderChar(ENV.resendApiKey);
  if (badChar) {
    return {
      success: false,
      error: `RESEND_API_KEY contains an invalid character (code point ${badChar.code} at position ${badChar.index}) — likely a "smart" quote/dash/bullet from a copy-paste. Re-copy the key directly from Resend's dashboard into Railway's env vars, typing over any autocorrected characters.`,
    };
  }

  const from = options.fromEmail
    ? options.fromName
      ? `${options.fromName} <${options.fromEmail}>`
      : options.fromEmail
    : ENV.emailFrom || "onboarding@resend.dev";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.resendApiKey}`,
      },
      body: JSON.stringify({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { success: false, error: `Resend API error (${response.status}): ${detail}` };
    }

    const result = (await response.json()) as { id: string };
    return { success: true, id: result.id };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
