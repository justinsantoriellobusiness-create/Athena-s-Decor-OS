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

// Accepts standard 5-field cron (min hour dom mon dow) or 6-field with a
// leading seconds field (ignored — we only poll once per minute). Every
// module seeded in seed.ts uses 5-field expressions; requiring 6 fields
// meant no scheduled module ever actually fired.
function isDueThisMinute(cronExpression: string, now: Date): boolean {
  let fields = cronExpression.trim().split(/\s+/);
  if (fields.length === 5) fields = ["0", ...fields];
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

// Autonomous Hub routes (frequencyHours-based, not cron expressions) self-
// throttle inside each handler via isAutonomousConfigDue(), so this just
// needs to ping each route periodically and let it no-op when nothing's due.
const AUTONOMOUS_ROUTES = [
  "email-scraper",
  "email-campaigns",
  "backlinker",
  "blog-autonomous",
  "site-audit",
  "product-sourcing",
  "ai-suggestions",
];
const AUTONOMOUS_CHECK_INTERVAL_MS = 5 * 60_000;

function tickAutonomous(port: number) {
  for (const route of AUTONOMOUS_ROUTES) {
    fetch(`http://127.0.0.1:${port}/api/scheduled/${route}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [INTERNAL_CRON_SECRET_HEADER]: ENV.cookieSecret,
      },
      body: "{}",
    })
      .then(res => {
        if (!res.ok) {
          console.error(`[Scheduler] autonomous/${route} returned ${res.status}`);
        }
      })
      .catch(error => {
        console.error(`[Scheduler] Failed to trigger autonomous/${route}:`, error);
      });
  }
}

let legacyIntervalHandle: ReturnType<typeof setInterval> | null = null;
let autonomousIntervalHandle: ReturnType<typeof setInterval> | null = null;
let initialTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

export function startInternalScheduler(port: number) {
  if (!ENV.cookieSecret) {
    console.warn(
      "[Scheduler] JWT_SECRET is not set — internal automation scheduler disabled."
    );
    return;
  }
  legacyIntervalHandle = setInterval(() => {
    tick(port).catch(error => console.error("[Scheduler] tick failed:", error));
  }, CHECK_INTERVAL_MS);
  autonomousIntervalHandle = setInterval(() => {
    tickAutonomous(port);
  }, AUTONOMOUS_CHECK_INTERVAL_MS);
  // Fire once shortly after boot too, so enabling a module doesn't require
  // waiting a full interval before its first check.
  initialTimeoutHandle = setTimeout(() => tickAutonomous(port), 15_000);
  console.log("[Scheduler] Internal automation scheduler started (legacy: polls every 60s, autonomous hub: polls every 5m).");
}

// Stops all scheduling loops so a graceful shutdown doesn't fire a new tick
// mid-drain — does not cancel already-in-flight scheduled-route requests.
export function stopInternalScheduler() {
  if (legacyIntervalHandle) clearInterval(legacyIntervalHandle);
  if (autonomousIntervalHandle) clearInterval(autonomousIntervalHandle);
  if (initialTimeoutHandle) clearTimeout(initialTimeoutHandle);
  legacyIntervalHandle = null;
  autonomousIntervalHandle = null;
  initialTimeoutHandle = null;
}
