/**
 * Self-hosted replacement for Manus's Heartbeat/Forge cron service, which is
 * unreachable outside the Manus platform. Polls automationSettings every
 * minute and fires the matching /api/scheduled/:module route in-process when
 * a row's cronExpression is due, using a shared secret instead of a Manus
 * cron session cookie.
 */
import { ENV } from "./env";
import { getAllAutomationSettings } from "../db";

export const INTERNAL_CRON_SECRET_HEADER = "x-internal-cron-secret";

const CHECK_INTERVAL_MS = 60_000;

function matchesField(field: string, value: number): boolean {
  if (field === "*") return true;
  return field.split(",").some(part => {
    if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = Number(stepStr);
      if (!step) return false;
      const base = range === "*" ? 0 : Number(range);
      return value >= base && (value - base) % step === 0;
    }
    return Number(part) === value;
  });
}

// 6-field cron: sec min hour dom mon dow. Seconds are ignored since we only
// poll once per minute; a job is "due" if the current minute matches.
function isDueThisMinute(cronExpression: string, now: Date): boolean {
  const fields = cronExpression.trim().split(/\s+/);
  if (fields.length !== 6) return false;
  const [, min, hour, dom, mon, dow] = fields;
  return (
    matchesField(min, now.getUTCMinutes()) &&
    matchesField(hour, now.getUTCHours()) &&
    matchesField(dom, now.getUTCDate()) &&
    matchesField(mon, now.getUTCMonth() + 1) &&
    matchesField(dow, now.getUTCDay())
  );
}

const lastFiredMinute = new Map<string, string>();

async function tick(port: number) {
  let settings;
  try {
    settings = await getAllAutomationSettings();
  } catch (error) {
    console.error("[Scheduler] Failed to load automation settings:", error);
    return;
  }

  const now = new Date();
  const minuteKey = now.toISOString().slice(0, 16);

  for (const setting of settings) {
    if (!setting.enabled || !setting.cronExpression) continue;
    if (!isDueThisMinute(setting.cronExpression, now)) continue;
    if (lastFiredMinute.get(setting.module) === minuteKey) continue;
    lastFiredMinute.set(setting.module, minuteKey);

    fetch(`http://127.0.0.1:${port}/api/scheduled/${setting.module}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [INTERNAL_CRON_SECRET_HEADER]: ENV.cookieSecret,
      },
      body: "{}",
    })
      .then(res => {
        if (!res.ok) {
          console.error(`[Scheduler] ${setting.module} returned ${res.status}`);
        }
      })
      .catch(error => {
        console.error(`[Scheduler] Failed to trigger ${setting.module}:`, error);
      });
  }
}

export function startInternalScheduler(port: number) {
  if (!ENV.cookieSecret) {
    console.warn(
      "[Scheduler] JWT_SECRET is not set — internal automation scheduler disabled."
    );
    return;
  }
  setInterval(() => {
    tick(port).catch(error => console.error("[Scheduler] tick failed:", error));
  }, CHECK_INTERVAL_MS);
  console.log("[Scheduler] Internal automation scheduler started (polls every 60s).");
}
