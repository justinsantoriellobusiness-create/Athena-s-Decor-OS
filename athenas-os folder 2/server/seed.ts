import { getDb } from "./db";
import { automationSettings, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
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

export async function seedIntegrationsFromEnv() {
  if (!ENV.cookieSecret) {
    console.warn("[Seed] JWT_SECRET not set — skipping integration seed (credentials cannot be encrypted).");
    return;
  }

  const db = await getDb();
  if (!db) return;

  const { encryptCredential } = await import("./crypto");
  const {
    upsertShopifyConfig,
    upsertSourcingAppCredential,
    upsertIntegrationToken,
  } = await import("./db");

  // Resolve the admin user ID so we can write to integrationTokens (used by IntegrationsPage)
  let adminUserId: number | null = null;
  try {
    let adminRows: { id: number }[] = [];
    if (ENV.ownerOpenId) {
      adminRows = await db.select({ id: users.id }).from(users).where(eq(users.openId, ENV.ownerOpenId)).limit(1);
    }
    if (!adminRows.length) {
      adminRows = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
    }
    adminUserId = adminRows[0]?.id ?? null;
  } catch {
    // Users table may not exist yet on first boot — integrationTokens seeding skipped
  }

  // ── Shopify ──────────────────────────────────────────────────────────────────
  const shopifyDomain = process.env.SHOPIFY_DOMAIN;
  const shopifyToken  = process.env.SHOPIFY_ADMIN_TOKEN;
  if (shopifyDomain && shopifyToken) {
    try {
      const encryptedToken = encryptCredential(shopifyToken);
      let productCount = 0;
      try {
        const { getShopifyClient } = await import("./shopify");
        const client = await getShopifyClient(shopifyDomain, shopifyToken);
        const countData = await client.getProductCount();
        productCount = countData.count ?? 0;
      } catch (e) {
        console.warn("[Seed] Shopify product count fetch failed — will store 0:", e);
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
      console.warn("[Seed] Shopify seed failed:", err);
    }
  }

  // ── CJ Dropshipping ──────────────────────────────────────────────────────────
  const cjApiKey = process.env.CJ_API_KEY;
  const cjEmail  = process.env.CJ_EMAIL;
  if (cjApiKey) {
    try {
      await upsertSourcingAppCredential("cj", {
        apiKey: encryptCredential(cjApiKey),
        apiSecret: cjEmail ?? "",
        isConnected: true,
        lastTestedAt: new Date(),
      });
      if (adminUserId !== null) {
        await upsertIntegrationToken(adminUserId, "cj_dropshipping", {
          accessToken: encryptCredential(cjApiKey),
          isActive: true,
          connectedAt: new Date(),
        });
      }
      console.log("[Seed] CJ Dropshipping credentials stored.");
    } catch (err) {
      console.warn("[Seed] CJ Dropshipping seed failed:", err);
    }
  }

  // ── DSers ────────────────────────────────────────────────────────────────────
  const dsersEmail    = process.env.DSERS_EMAIL;
  const dsersPassword = process.env.DSERS_PASSWORD;
  if (dsersEmail && dsersPassword) {
    try {
      await upsertSourcingAppCredential("autods", {
        apiKey: encryptCredential(dsersPassword),
        storeId: dsersEmail,
        isConnected: true,
        lastTestedAt: new Date(),
      });
      if (adminUserId !== null) {
        await upsertIntegrationToken(adminUserId, "autods", {
          accessToken: encryptCredential(dsersPassword),
          isActive: true,
          connectedAt: new Date(),
        });
      }
      console.log("[Seed] DSers credentials stored.");
    } catch (err) {
      console.warn("[Seed] DSers seed failed:", err);
    }
  }
}
