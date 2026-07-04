import { getDb } from "./db";
import { automationSettings } from "../drizzle/schema";
import { encryptCredential } from "./crypto";
import { ENV } from "./_core/env";

const DEFAULT_MODULES = [
  { module: "seo", enabled: true, cronExpression: "0 9 * * *" },
  { module: "blog", enabled: true, cronExpression: "0 10 * * 1" },
  { module: "sourcing", enabled: false, cronExpression: "0 9 * * *" },
  { module: "inventory", enabled: true, cronExpression: "0 */6 * * *" },
  { module: "ads", enabled: false, cronExpression: "0 9 * * *" },
  { module: "shopify", enabled: true, cronExpression: "0 */6 * * *" },
  { module: "accounting", enabled: true, cronExpression: "0 0 * * *" },
  { module: "audit", enabled: false, cronExpression: "0 3 * * 0" },
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

/**
 * Auto-connect integrations from environment variables.
 * Runs on every startup — safe to re-run (uses upsert).
 * Credentials are encrypted with JWT_SECRET before storage.
 */
export async function seedIntegrationsFromEnv() {
  if (!ENV.cookieSecret) {
    console.warn("[Seed] JWT_SECRET not set — skipping integration seed (encryption unavailable)");
    return;
  }

  // ── Shopify ──────────────────────────────────────────────────────────────
  const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;
  if (shopifyDomain && shopifyToken) {
    try {
      const { upsertShopifyConfig } = await import("./db");
      await upsertShopifyConfig({
        storeDomain: shopifyDomain,
        accessToken: encryptCredential(shopifyToken),
      });
      console.log("[Seed] Shopify connected:", shopifyDomain);
    } catch (err) {
      console.warn("[Seed] Failed to seed Shopify config:", err);
    }
  }

  // ── CJ Dropshipping ──────────────────────────────────────────────────────
  const cjApiKey = process.env.CJ_API_KEY;
  const cjEmail = process.env.CJ_EMAIL;
  if (cjApiKey && cjEmail) {
    try {
      const { upsertSourcingAppCredential } = await import("./db");
      await upsertSourcingAppCredential("cj", {
        email: cjEmail,
        apiKey: encryptCredential(cjApiKey),
        status: "active",
      });
      console.log("[Seed] CJ Dropshipping connected:", cjEmail);
    } catch (err) {
      console.warn("[Seed] Failed to seed CJ credentials:", err);
    }
  }

  // ── DSers ─────────────────────────────────────────────────────────────────
  const dsersEmail = process.env.DSERS_EMAIL;
  const dsersPassword = process.env.DSERS_PASSWORD;
  if (dsersEmail && dsersPassword) {
    try {
      const { upsertSourcingAppCredential } = await import("./db");
      await upsertSourcingAppCredential("dsers", {
        email: dsersEmail,
        apiKey: encryptCredential(dsersPassword),
        status: "active",
      });
      console.log("[Seed] DSers connected:", dsersEmail);
    } catch (err) {
      console.warn("[Seed] Failed to seed DSers credentials:", err);
    }
  }
}
