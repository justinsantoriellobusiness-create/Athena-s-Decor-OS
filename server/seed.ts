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
 * Fetch a fresh Shopify access token using OAuth client credentials.
 * Tokens expire every 24h — called on every boot so they're always fresh.
 */
async function fetchShopifyAccessToken(shop: string, clientId: string, clientSecret: string): Promise<string | null> {
  try {
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[Seed] Shopify OAuth failed (${res.status}): ${text}`);
      return null;
    }
    const data = await res.json() as { access_token?: string };
    return data.access_token ?? null;
  } catch (err) {
    console.warn("[Seed] Shopify OAuth request failed:", err);
    return null;
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

  // ── Shopify ──────────────────────────────────────────────────────────────────
  const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const shopifyClientId = process.env.SHOPIFY_CLIENT_ID;
  const shopifyClientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  // Fall back to static token if no client credentials provided
  const shopifyStaticToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (shopifyDomain && (shopifyClientId || shopifyStaticToken)) {
    try {
      let shopifyToken = shopifyStaticToken ?? null;

      // Prefer OAuth client credentials — auto-refreshes on every boot
      if (shopifyClientId && shopifyClientSecret) {
        const freshToken = await fetchShopifyAccessToken(shopifyDomain, shopifyClientId, shopifyClientSecret);
        if (freshToken) {
          shopifyToken = freshToken;
          console.log("[Seed] Shopify: fetched fresh OAuth token via client credentials");
        } else {
          console.warn("[Seed] Shopify: OAuth failed, falling back to SHOPIFY_ACCESS_TOKEN");
        }
      }

      if (!shopifyToken) {
        console.warn("[Seed] Shopify: no valid token available — skipping");
      } else {
        const { getShopifyClient } = await import("./shopify");
        const client = await getShopifyClient(shopifyDomain, shopifyToken);

        let productCount = 0;
        try {
          const countData = await client.getProductCount();
          productCount = countData.count ?? 0;
        } catch (countErr) {
          console.warn("[Seed] Shopify product count failed:", countErr);
        }

        const encryptedToken = encryptCredential(shopifyToken);

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
      }
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
