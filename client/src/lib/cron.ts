/**
 * Human-readable labels for the cron expressions the scheduler stores.
 * Crons execute in UTC on the server; the store owner works in Eastern
 * Time, so labels convert fixed-hour schedules to ET instead of showing
 * raw strings like "0 9 * * *" (which read as gibberish in the UI).
 */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Format a UTC hour as its Eastern Time equivalent (DST-aware for today's date). */
export function utcHourToEt(hour: number): string {
  const now = new Date();
  const atUtcHour = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0));
  return atUtcHour.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

export function cronLabel(cron: string | null | undefined): string {
  if (!cron) return "Not scheduled";
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour, dom, , dow] = parts;

  if (min.startsWith("*/")) return `Every ${min.slice(2)} minutes`;
  if (min === "0" && hour === "*") return "Every hour";
  if (min === "0" && hour.startsWith("*/")) return `Every ${hour.slice(2)} hours`;

  if (min === "0" && /^\d+$/.test(hour) && dom === "*") {
    const etTime = utcHourToEt(Number(hour));
    if (dow === "*") return `Daily at ${etTime} ET`;
    if (/^\d+$/.test(dow)) return `Weekly ${DAY_NAMES[Number(dow) % 7]} at ${etTime} ET`;
  }
  if (min === "0" && hour.includes(",") && dom === "*" && dow === "*") {
    const times = hour.split(",").filter(h => /^\d+$/.test(h)).map(h => utcHourToEt(Number(h)));
    if (times.length) return `Daily at ${times.join(" & ")} ET`;
  }
  return cron;
}
