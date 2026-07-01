import { getDb } from "./db";
import { automationSettings } from "../drizzle/schema";

const DEFAULT_MODULES = [
  { module: "seo", enabled: true, cronExpression: "0 9 * * *" },
  { module: "blog", enabled: true, cronExpression: "0 10 * * 1" },
  { module: "sourcing", enabled: false, cronExpression: "0 9 * * *" },
  { module: "inventory", enabled: true, cronExpression: "0 */6 * * *" },
  { module: "ads", enabled: false, cronExpression: "0 9 * * *" },
  { module: "shopify", enabled: true, cronExpression: "0 */6 * * *" },
  { module: "accounting", enabled: true, cronExpression: "0 0 * * *" }, // Daily midnight auto-sync
  { module: "audit", enabled: false, cronExpression: "0 3 * * 0" }, // Weekly Sunday 3am site audit
];

export async function seedDefaultSettings() {
  const db = await getDb();
  if (!db) return;
  try {
    for (const setting of DEFAULT_MODULES) {
      await db.insert(automationSettings).values(setting).onDuplicateKeyUpdate({ set: { module: setting.module } });
    }
  } catch (err) {
    console.warn("[Seed] Failed to seed default settings:", err);
  }
}
