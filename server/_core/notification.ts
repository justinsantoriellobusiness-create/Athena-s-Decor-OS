import { TRPCError } from "@trpc/server";
import { ENV } from "./env";
import { sendEmail, isEmailConfigured } from "./email";
import { logActivity } from "../db";

export type NotificationPayload = {
  title: string;
  content: string;
  /** Which automation this is about, shown in the in-app Activity feed. */
  module?: string;
  /** Severity for the Activity feed. Inferred from the title if omitted. */
  level?: "info" | "success" | "warning" | "error";
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

  return { title, content, module: input.module, level: input.level };
};

function inferLevel(title: string): "info" | "success" | "warning" | "error" {
  const t = title.toLowerCase();
  if (t.includes("fail") || t.includes("error") || t.includes("stuck") || t.includes("expired")) return "error";
  if (t.includes("needs manual") || t.includes("skipped") || t.includes("some accounts failed") || t.includes("flagged")) return "warning";
  if (t.includes("connected") || t.includes("shipped") || t.includes("placed") || t.includes("published") || t.includes("synced") || t.includes("routed")) return "success";
  return "info";
}

/**
 * Notifies the store owner by email (via Resend) AND always records the
 * event in the in-app Activity feed — the feed write happens regardless of
 * whether email is configured or the send succeeds, since email delivery
 * failing shouldn't also mean there's zero visible record that an
 * automation did something. This is the app's real "proof of work" trail.
 *
 * Returns `true` if the email send succeeded, `false` otherwise — callers
 * should treat the return value as best-effort, not critical.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content, module, level } = validatePayload(payload);

  await logActivity({
    module: module ?? "general",
    level: level ?? inferLevel(title),
    title,
    detail: content,
  });

  if (!isEmailConfigured() || !ENV.adminEmail) {
    console.warn(
      "[Notification] Skipped email: RESEND_API_KEY and/or ADMIN_EMAIL not configured (still logged to Activity feed)"
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
