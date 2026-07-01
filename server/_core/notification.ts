import { TRPCError } from "@trpc/server";
import { ENV } from "./env";
import { sendEmail, isEmailConfigured } from "./email";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/**
 * Notifies the store owner by email (via Resend, see server/_core/email.ts).
 * Returns `true` if the send succeeded, `false` if email isn't configured or
 * the send failed — callers should treat this as best-effort, not critical.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  if (!isEmailConfigured() || !ENV.adminEmail) {
    console.warn(
      "[Notification] Skipped: RESEND_API_KEY and/or ADMIN_EMAIL not configured"
    );
    return false;
  }

  const result = await sendEmail({
    to: ENV.adminEmail,
    subject: title,
    text: content,
    html: `<p>${content.replace(/\n/g, "<br>")}</p>`,
  });

  if (!result.success) {
    console.warn(`[Notification] Failed to notify owner: ${result.error}`);
    return false;
  }

  return true;
}
