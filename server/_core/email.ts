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

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  if (!ENV.resendApiKey) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
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
