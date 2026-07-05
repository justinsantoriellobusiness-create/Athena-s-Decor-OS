import { getDb } from "./db";
import { automationSettings, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
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
 *
 * Writes to TWO places per integration:
 *   1. shopifyConfig / sourcingAppCredentials — used by automations
 *   2. integrationTokens (per admin user) — read by IntegrationsPage UI
 */
export async function seedIntegrationsFromEnv() {
  if (!ENV.cookieSecret) {
    console.warn("[Seed] JWT_SECRET not set — skipping integration seed (encryption unavailable)");
    return;
  }

  const { upsertShopifyConfig, upsertSourcingAppCredential, upsertIntegrationToken } = await import("./db");

  // Resolve admin user ID for integrationTokens (IntegrationsPage reads by userId)
  let adminUserId: number | null = null;
  try {
    const db = await getDb();
    if (db) {
      let rows: { id: number }[] = [];
      if (ENV.ownerOpenId) {
        rows = await db.select({ id: users.id }).from(users).where(eq(users.openId, ENV.ownerOpenId)).limit(1);
      }
      if (!rows.length) {
        rows = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
      }
      if (!rows.length) {
        rows = await db.select({ id: users.id }).from(users).limit(1);
      }
      adminUserId = rows[0]?.id ?? null;
    }
  } catch {
    // Users table may not exist yet on very first migration boot
  }

  if (!adminUserId) {
    console.warn("[Seed] No user found yet — integrationTokens skipped (will populate on next restart after first login)");
  }

  // ── Shopify ──────────────────────────────────────────────────────────────────
  const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;
  if (shopifyDomain && shopifyToken) {
    try {
      const encryptedToken = encryptCredential(shopifyToken);

      // Fetch live product count on startup
      let productCount = 0;
      try {
        const res = await fetch(`https://${shopifyDomain}/admin/api/2024-01/products/count.json`, {
          headers: { "X-Shopify-Access-Token": shopifyToken },
        });
        if (res.ok) {
          const data = await res.json() as { count?: number };
          productCount = data.count ?? 0;
        }
      } catch {
        // Non-fatal — store 0 if Shopify is unreachable at boot
      }

      await upsertShopifyConfig({
        storeDomain: shopifyDomain,
        accessToken: encryptedToken,
        isConnected: true,
        lastSyncAt: new Date(),
        productCount,
      });

      if (adminUserId !== null) {
        await upsertIntegrationToken(adminUserId, "shopify", {
          accessToken: encryptedToken,
          shopDomain: shopifyDomain,
          isActive: true,
          connectedAt: new Date(),
        });
      }

      console.log(`[Seed] Shopify connected: ${shopifyDomain} (${productCount} products)`);
    } catch (err) {
      console.warn("[Seed] Failed to seed Shopify config:", err);
    }
  }

  // ── CJ Dropshipping ──────────────────────────────────────────────────────────
  const cjApiKey = process.env.CJ_API_KEY;
  const cjEmail = process.env.CJ_EMAIL;
  if (cjApiKey && cjEmail) {
    try {
      const encryptedKey = encryptCredential(cjApiKey);

      await upsertSourcingAppCredential("cj", {
        apiKey: encryptedKey,
        apiSecret: cjEmail,
        isConnected: true,
        lastTestedAt: new Date(),
      });

      if (adminUserId !== null) {
        await upsertIntegrationToken(adminUserId, "cj_dropshipping", {
          accessToken: encryptedKey,
          isActive: true,
          connectedAt: new Date(),
        });
      }

      console.log("[Seed] CJ Dropshipping connected:", cjEmail);
    } catch (err) {
      console.warn("[Seed] Failed to seed CJ credentials:", err);
    }
  }

  // ── DSers ─────────────────────────────────────────────────────────────────────
  const dsersEmail = process.env.DSERS_EMAIL;
  const dsersPassword = process.env.DSERS_PASSWORD;
  if (dsersEmail && dsersPassword) {
    try {
      const encryptedPass = encryptCredential(dsersPassword);

      await upsertSourcingAppCredential("dsers", {
        apiKey: encryptedPass,
        storeId: dsersEmail,
        isConnected: true,
        lastTestedAt: new Date(),
      });

      if (adminUserId !== null) {
        await upsertIntegrationToken(adminUserId, "dsers", {
          accessToken: encryptedPass,
          isActive: true,
          connectedAt: new Date(),
        });
      }

      console.log("[Seed] DSers connected:", dsersEmail);
    } catch (err) {
      console.warn("[Seed] Failed to seed DSers credentials:", err);
    }
  }
}
