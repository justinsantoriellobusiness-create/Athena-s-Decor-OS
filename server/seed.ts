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
 * Credentials are AES-256-GCM encrypted with JWT_SECRET before storage.
 */
export async function seedIntegrationsFromEnv() {
  if (!ENV.cookieSecret) {
    console.warn("[Seed] JWT_SECRET not set — skipping integration seed (encryption unavailable)");
    return;
  }

  const { upsertShopifyConfig, upsertSourcingAppCredential } = await import("./db");

  // ── Shopify ──────────────────────────────────────────────────────────────────
  const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;
  if (shopifyDomain && shopifyToken) {
    try {
      await upsertShopifyConfig({
        storeDomain: shopifyDomain,
        accessToken: encryptCredential(shopifyToken),
        isConnected: true,
        lastSyncAt: new Date(),
      });
      console.log("[Seed] Shopify connected:", shopifyDomain);
    } catch (err) {
      console.warn("[Seed] Failed to seed Shopify config:", err);
    }
  }

  // ── CJ Dropshipping ──────────────────────────────────────────────────────────
  // apiKey = encrypted API key, apiSecret = CJ email (identifier), isConnected = true
  const cjApiKey = process.env.CJ_API_KEY;
  const cjEmail = process.env.CJ_EMAIL;
  if (cjApiKey && cjEmail) {
    try {
      await upsertSourcingAppCredential("cj", {
        apiKey: encryptCredential(cjApiKey),
        apiSecret: cjEmail,
        isConnected: true,
        lastTestedAt: new Date(),
      });
      console.log("[Seed] CJ Dropshipping connected:", cjEmail);
    } catch (err) {
      console.warn("[Seed] Failed to seed CJ credentials:", err);
    }
  }

  // ── DSers ─────────────────────────────────────────────────────────────────────
  // apiKey = encrypted password, storeId = DSers email (identifier), isConnected = true
  const dsersEmail = process.env.DSERS_EMAIL;
  const dsersPassword = process.env.DSERS_PASSWORD;
  if (dsersEmail && dsersPassword) {
    try {
      await upsertSourcingAppCredential("dsers", {
        apiKey: encryptCredential(dsersPassword),
        storeId: dsersEmail,
        isConnected: true,
        lastTestedAt: new Date(),
      });
      console.log("[Seed] DSers connected:", dsersEmail);
    } catch (err) {
      console.warn("[Seed] Failed to seed DSers credentials:", err);
    }
  }
}
