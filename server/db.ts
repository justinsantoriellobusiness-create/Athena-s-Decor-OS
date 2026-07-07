import { eq, desc, and, ne, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  shopifyConfig,
  automationSettings,
  seoKeywords,
  seoJobs,
  blogPosts,
  sourcingSpecs,
  sourcedProducts,
  inventorySnapshots,
  adCampaigns,
  adCreatives,
  financialAccounts,
  transactions,
  taxSettings,
  type ShopifyConfig,
  type AutomationSettings,
  type SeoKeyword,
  type SeoJob,
  type BlogPost,
  type SourcingSpec,
  type SourcedProduct,
  type InventorySnapshot,
  type AdCampaign,
  type AdCreative,
  type FinancialAccount,
  type Transaction,
  type InsertTransaction,
  type TaxSettings,
  sourcingAppCredentials,
  type SourcingAppCredential,
  autonomousConfigs,
  type AutonomousConfig,
  campaignProducts,
  type CampaignProduct,
  wixConfig,
  type WixConfig,
  wixProducts,
  type WixProduct,
  wixOrders,
  type WixOrder,
  wixAnalytics,
  type WixAnalytics,
  zapierConfig,
  type ZapierConfig,
  zapierWebhooks,
  type ZapierWebhook,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Shopify Config ───────────────────────────────────────────────────────────
export async function getShopifyConfig(): Promise<ShopifyConfig | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(shopifyConfig).limit(1);
  return result[0];
}

export async function upsertShopifyConfig(data: Partial<ShopifyConfig> & { storeDomain: string; accessToken: string }) {
  const db = await getDb();
  if (!db) return;
  const existing = await getShopifyConfig();
  if (existing) {
    await db.update(shopifyConfig).set({ ...data, updatedAt: new Date() }).where(eq(shopifyConfig.id, existing.id));
  } else {
    await db.insert(shopifyConfig).values(data as any);
  }
}

// ─── Automation Settings ──────────────────────────────────────────────────────
export async function getAllAutomationSettings(): Promise<AutomationSettings[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(automationSettings);
}

export async function getAutomationSetting(module: string): Promise<AutomationSettings | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(automationSettings).where(eq(automationSettings.module, module)).limit(1);
  return result[0];
}

export async function updateAutomationSetting(module: string, data: Partial<AutomationSettings>) {
  const db = await getDb();
  if (!db) return;
  await db.update(automationSettings).set({ ...data, updatedAt: new Date() }).where(eq(automationSettings.module, module));
}

// Atomic lock: acquires the run lock for a module by flipping lastRunStatus
// to "running" only if it isn't already "running" — a single UPDATE...WHERE
// is atomic at the MySQL row level, so two concurrent callers (e.g. the
// scheduler firing twice, or a redeploy overlapping an in-flight tick)
// can't both succeed. Returns true if the caller acquired the lock.
export async function tryAcquireAutomationLock(module: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result: any = await db.update(automationSettings)
    .set({ lastRunStatus: "running", updatedAt: new Date() })
    .where(and(eq(automationSettings.module, module), ne(automationSettings.lastRunStatus, "running")));
  const affected = result?.[0]?.affectedRows ?? result?.affectedRows ?? 0;
  return affected > 0;
}

export async function releaseAutomationLock(module: string, status: "success" | "error", message?: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(automationSettings)
    .set({ lastRunStatus: status, lastRunMessage: message, lastRunAt: new Date(), updatedAt: new Date() })
    .where(eq(automationSettings.module, module));
}

// ─── SEO Keywords ─────────────────────────────────────────────────────────────
export async function getSeoKeywords(limit = 100): Promise<SeoKeyword[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(seoKeywords).orderBy(desc(seoKeywords.searchVolume)).limit(limit);
}

export async function insertSeoKeywords(keywords: typeof seoKeywords.$inferInsert[]) {
  const db = await getDb();
  if (!db) return;
  if (keywords.length === 0) return;
  await db.insert(seoKeywords).values(keywords).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
}

// ─── SEO Jobs ─────────────────────────────────────────────────────────────────
export async function getSeoJobs(limit = 20): Promise<SeoJob[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(seoJobs).orderBy(desc(seoJobs.createdAt)).limit(limit);
}

export async function createSeoJob(data: typeof seoJobs.$inferInsert): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(seoJobs).values(data);
  return (result[0] as any).insertId;
}

export async function updateSeoJob(id: number, data: Partial<SeoJob>) {
  const db = await getDb();
  if (!db) return;
  await db.update(seoJobs).set(data).where(eq(seoJobs.id, id));
}

// ─── Blog Posts ───────────────────────────────────────────────────────────────
export async function getBlogPosts(limit = 20): Promise<BlogPost[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt)).limit(limit);
}

export async function getBlogPost(id: number): Promise<BlogPost | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
  return result[0];
}

export async function createBlogPost(data: typeof blogPosts.$inferInsert): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(blogPosts).values(data);
  return (result[0] as any).insertId;
}

export async function updateBlogPost(id: number, data: Partial<BlogPost>) {
  const db = await getDb();
  if (!db) return;
  await db.update(blogPosts).set({ ...data, updatedAt: new Date() }).where(eq(blogPosts.id, id));
}

export async function deleteBlogPost(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(blogPosts).where(eq(blogPosts.id, id));
}

// ─── Sourcing Specs ───────────────────────────────────────────────────────────
export async function getSourcingSpecs(): Promise<SourcingSpec[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sourcingSpecs).orderBy(desc(sourcingSpecs.createdAt));
}

export async function createSourcingSpec(data: typeof sourcingSpecs.$inferInsert): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(sourcingSpecs).values(data);
  return (result[0] as any).insertId;
}

export async function updateSourcingSpec(id: number, data: Partial<SourcingSpec>) {
  const db = await getDb();
  if (!db) return;
  await db.update(sourcingSpecs).set({ ...data, updatedAt: new Date() }).where(eq(sourcingSpecs.id, id));
}

export async function deleteSourcingSpec(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(sourcingSpecs).where(eq(sourcingSpecs.id, id));
}

// ─── Sourced Products ─────────────────────────────────────────────────────────
export async function getSourcedProducts(specId: number): Promise<SourcedProduct[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sourcedProducts).where(eq(sourcedProducts.specId, specId)).orderBy(desc(sourcedProducts.orders));
}

export async function insertSourcedProducts(products: typeof sourcedProducts.$inferInsert[]) {
  const db = await getDb();
  if (!db) return;
  if (products.length === 0) return;
  await db.insert(sourcedProducts).values(products);
}

export async function getSourcedProductById(id: number): Promise<SourcedProduct | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(sourcedProducts).where(eq(sourcedProducts.id, id)).limit(1);
  return result[0];
}

export async function updateSourcedProduct(id: number, data: Partial<SourcedProduct>) {
  const db = await getDb();
  if (!db) return;
  await db.update(sourcedProducts).set(data).where(eq(sourcedProducts.id, id));
}

// ─── Sourcing App Credentials ───────────────────────────────────────────────
export async function getSourcingAppCredentials(): Promise<SourcingAppCredential[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sourcingAppCredentials).orderBy(sourcingAppCredentials.app);
}
export async function getSourcingAppCredential(app: "autods" | "cj" | "dsers"): Promise<SourcingAppCredential | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(sourcingAppCredentials).where(eq(sourcingAppCredentials.app, app)).limit(1);
  return rows[0];
}
export async function upsertSourcingAppCredential(app: "autods" | "cj" | "dsers", data: Partial<SourcingAppCredential>) {
  const db = await getDb();
  if (!db) return;
  const existing = await getSourcingAppCredential(app);
  if (existing) {
    await db.update(sourcingAppCredentials).set({ ...data, updatedAt: new Date() }).where(eq(sourcingAppCredentials.app, app));
  } else {
    await db.insert(sourcingAppCredentials).values({ app, ...data } as any);
  }
}
// ─── Inventory Snapshots ──────────────────────────────────────────────────────
export async function getInventorySnapshots(limit = 100): Promise<InventorySnapshot[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inventorySnapshots).orderBy(desc(inventorySnapshots.updatedAt)).limit(limit);
}

export async function upsertInventorySnapshot(data: typeof inventorySnapshots.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(inventorySnapshots).values(data).onDuplicateKeyUpdate({
    set: {
      supplierStock: data.supplierStock,
      shopifyStock: data.shopifyStock,
      status: data.status,
      autoUpdated: data.autoUpdated,
      lastCheckedAt: data.lastCheckedAt,
      updatedAt: new Date(),
    },
  });
}

// ─── Ad Campaigns ─────────────────────────────────────────────────────────────
export async function getAdCampaigns(): Promise<AdCampaign[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(adCampaigns).orderBy(desc(adCampaigns.createdAt));
}

export async function createAdCampaign(data: typeof adCampaigns.$inferInsert): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(adCampaigns).values(data);
  return (result[0] as any).insertId;
}

export async function updateAdCampaign(id: number, data: Partial<AdCampaign>) {
  const db = await getDb();
  if (!db) return;
  await db.update(adCampaigns).set({ ...data, updatedAt: new Date() }).where(eq(adCampaigns.id, id));
}

// ─── Ad Creatives ─────────────────────────────────────────────────────────────
export async function getAdCreatives(campaignId?: number): Promise<AdCreative[]> {
  const db = await getDb();
  if (!db) return [];
  if (campaignId) {
    return db.select().from(adCreatives).where(eq(adCreatives.campaignId, campaignId)).orderBy(desc(adCreatives.createdAt));
  }
  return db.select().from(adCreatives).orderBy(desc(adCreatives.createdAt)).limit(50);
}

export async function createAdCreative(data: typeof adCreatives.$inferInsert): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(adCreatives).values(data);
  return (result[0] as any).insertId;
}

export async function updateAdCreative(id: number, data: Partial<AdCreative>) {
  const db = await getDb();
  if (!db) return;
  await db.update(adCreatives).set({ ...data, updatedAt: new Date() }).where(eq(adCreatives.id, id));
}

// ─── Site Audit Runs ──────────────────────────────────────────────────────────
import {
  siteAuditRuns,
  siteAuditIssues,
  type SiteAuditRun,
  type SiteAuditIssue,
} from "../drizzle/schema";

export async function createAuditRun(data?: Partial<SiteAuditRun>): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(siteAuditRuns).values({ status: "running", ...data });
  return (result[0] as any).insertId;
}

export async function updateAuditRun(id: number, data: Partial<SiteAuditRun>) {
  const db = await getDb();
  if (!db) return;
  await db.update(siteAuditRuns).set(data).where(eq(siteAuditRuns.id, id));
}

export async function getAuditRuns(limit = 20): Promise<SiteAuditRun[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(siteAuditRuns).orderBy(desc(siteAuditRuns.createdAt)).limit(limit);
}

export async function getLatestAuditRun(): Promise<SiteAuditRun | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(siteAuditRuns).orderBy(desc(siteAuditRuns.createdAt)).limit(1);
  return result[0];
}

// ─── Site Audit Issues ────────────────────────────────────────────────────────
export async function insertAuditIssues(issues: typeof siteAuditIssues.$inferInsert[]) {
  const db = await getDb();
  if (!db || issues.length === 0) return;
  // Insert in batches of 50
  for (let i = 0; i < issues.length; i += 50) {
    await db.insert(siteAuditIssues).values(issues.slice(i, i + 50));
  }
}

export async function getAuditIssues(runId: number): Promise<SiteAuditIssue[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(siteAuditIssues).where(eq(siteAuditIssues.runId, runId)).orderBy(siteAuditIssues.severity, siteAuditIssues.pageType);
}

export async function updateAuditIssue(id: number, data: Partial<SiteAuditIssue>) {
  const db = await getDb();
  if (!db) return;
  await db.update(siteAuditIssues).set(data).where(eq(siteAuditIssues.id, id));
}

export async function getOpenAuditIssues(runId: number): Promise<SiteAuditIssue[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(siteAuditIssues)
    .where(eq(siteAuditIssues.runId, runId))
    .orderBy(siteAuditIssues.severity);
}

// ─── Accounting: Financial Accounts ──────────────────────────────────────────
export async function getFinancialAccounts(): Promise<FinancialAccount[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(financialAccounts).orderBy(financialAccounts.createdAt);
}

export async function getFinancialAccountById(id: number): Promise<FinancialAccount | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(financialAccounts).where(eq(financialAccounts.id, id)).limit(1);
  return rows[0];
}

export async function upsertFinancialAccount(data: Partial<FinancialAccount> & { name: string; provider: FinancialAccount["provider"]; accountType: FinancialAccount["accountType"] }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(financialAccounts).values(data as any).onDuplicateKeyUpdate({ set: data as any });
}

export async function updateFinancialAccount(id: number, data: Partial<FinancialAccount>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(financialAccounts).set(data as any).where(eq(financialAccounts.id, id));
}

export async function deleteFinancialAccount(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(financialAccounts).where(eq(financialAccounts.id, id));
}

// ─── Accounting: Transactions ─────────────────────────────────────────────────
// ─── Deduplication helpers ────────────────────────────────────────────────────
import { createHash } from "crypto";

/**
 * Generate a deterministic fingerprint for a transaction.
 * Two transactions with the same fingerprint are considered duplicates.
 * Uses: source + externalId (if present) + rounded amount + date (day precision)
 */
export function buildFingerprint(data: {
  source: string;
  externalId?: string | null;
  amount: number;
  date: Date;
  description?: string;
}): string {
  // Round amount to 2 decimal places to avoid float drift. Guard against
  // NaN/non-finite amounts (malformed upstream data from PayPal/eBay) so a
  // parse failure can't collide multiple unrelated transactions onto the
  // same "NaN" fingerprint.
  const safeAmount = Number.isFinite(data.amount) ? data.amount : 0;
  const amt = Math.round(safeAmount * 100);
  // Day-level date precision (YYYY-MM-DD)
  const day = data.date.toISOString().slice(0, 10);
  // If we have an externalId, use it — it's the most reliable dedup key
  const key = data.externalId
    ? `${data.source}:${data.externalId}:${amt}`
    : `${data.source}:${day}:${amt}:${(data.description ?? "").slice(0, 40)}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 64);
}

/**
 * Cross-platform duplicate detection rules.
 * eBay orders often appear as PayPal transactions too.
 * Shopify Payments transactions often appear in bank statements.
 * Returns a reason string if it looks like a duplicate, null otherwise.
 */
function detectCrossPlatformDuplicate(
  incoming: InsertTransaction,
  existing: Transaction[]
): { isDuplicate: boolean; duplicateOfId?: number; reason?: string } {
  const safeIncomingAmount = Number.isFinite(incoming.amount) ? incoming.amount : 0;
  const amt = Math.round(safeIncomingAmount * 100);
  const day = incoming.date.toISOString().slice(0, 10);

  for (const t of existing) {
    if (t.isDuplicate) continue; // don't chain duplicates
    const safeExistingAmount = Number.isFinite(t.amount) ? t.amount : 0;
    const tAmt = Math.round(safeExistingAmount * 100);
    const tDay = t.date.toISOString().slice(0, 10);

    // Same amount, same day, different source — likely cross-platform duplicate
    if (amt === tAmt && day === tDay && t.source !== incoming.source) {
      // eBay sale + PayPal income on same day/amount = duplicate
      const ebayPaypal = (
        (incoming.source === "ebay" && t.source === "paypal") ||
        (incoming.source === "paypal" && t.source === "ebay")
      );
      // Shopify + bank/stripe same amount same day = duplicate
      const shopifyBank = (
        (incoming.source === "shopify" && (t.source === "bank" || t.source === "stripe")) ||
        ((incoming.source === "bank" || incoming.source === "stripe") && t.source === "shopify")
      );
      if (ebayPaypal) {
        return { isDuplicate: true, duplicateOfId: t.id, reason: `Possible duplicate: same amount ${t.amount} on ${day} already recorded from ${t.source}. eBay sales often appear in PayPal — keeping first entry.` };
      }
      if (shopifyBank) {
        return { isDuplicate: true, duplicateOfId: t.id, reason: `Possible duplicate: same amount ${t.amount} on ${day} already recorded from ${t.source}. Shopify payouts often appear in bank statements — keeping first entry.` };
      }
    }
  }
  return { isDuplicate: false };
}

export async function getTransactions(filters?: {
  accountId?: number;
  type?: Transaction["type"];
  category?: Transaction["category"];
  source?: Transaction["source"];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  includeDuplicates?: boolean; // default false — excludes duplicates from P&L
}): Promise<Transaction[]> {
  const db = await getDb();
  if (!db) return [];
  const { gte, lte } = await import("drizzle-orm");
  let query = db.select().from(transactions).$dynamic();
  const conditions: any[] = [];
  if (filters?.accountId) conditions.push(eq(transactions.accountId, filters.accountId));
  if (filters?.type) conditions.push(eq(transactions.type, filters.type));
  if (filters?.category) conditions.push(eq(transactions.category, filters.category));
  if (filters?.source) conditions.push(eq(transactions.source, filters.source));
  if (filters?.startDate) conditions.push(gte(transactions.date, filters.startDate));
  if (filters?.endDate) conditions.push(lte(transactions.date, filters.endDate));
  // Exclude duplicates from financial calculations by default
  if (!filters?.includeDuplicates) {
    conditions.push(eq(transactions.isDuplicate, false));
  }
  if (conditions.length > 0) query = query.where(and(...conditions));
  return query.orderBy(desc(transactions.date)).limit(filters?.limit ?? 500);
}

/**
 * Insert a single transaction with full deduplication:
 * 1. Compute fingerprint — skip if already exists (exact duplicate)
 * 2. Check cross-platform rules — flag as duplicate if matches
 */
export async function insertTransaction(data: InsertTransaction): Promise<{ inserted: boolean; isDuplicate?: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) return { inserted: false, reason: "DB unavailable" };

  const fingerprint = buildFingerprint({
    source: data.source ?? "manual",
    externalId: data.externalId,
    amount: data.amount,
    date: data.date,
    description: data.description,
  });

  // 1. Exact fingerprint check
  const existing = await db.select().from(transactions)
    .where(eq(transactions.fingerprint, fingerprint)).limit(1);
  if (existing.length > 0) {
    return { inserted: false, reason: `Exact duplicate skipped (fingerprint match with transaction #${existing[0].id})` };
  }

  // 2. Cross-platform duplicate check — look at same-day transactions
  const dayStart = new Date(data.date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(data.date);
  dayEnd.setHours(23, 59, 59, 999);
  const { gte, lte } = await import("drizzle-orm");
  const sameDayTxns = await db.select().from(transactions)
    .where(and(gte(transactions.date, dayStart), lte(transactions.date, dayEnd)))
    .limit(200);

  const dupCheck = detectCrossPlatformDuplicate(data, sameDayTxns);

  await db.insert(transactions).values({
    ...data,
    fingerprint,
    isDuplicate: dupCheck.isDuplicate,
    duplicateOfId: dupCheck.duplicateOfId ?? null,
    duplicateReason: dupCheck.reason ?? null,
  });

  return { inserted: true, isDuplicate: dupCheck.isDuplicate ?? false, reason: dupCheck.reason };
}

/**
 * Bulk insert with deduplication — skips exact fingerprint matches,
 * flags cross-platform duplicates, returns counts.
 */
export async function insertTransactions(data: InsertTransaction[]): Promise<{
  inserted: number;
  skipped: number;
  flagged: number;
}> {
  const db = await getDb();
  if (!db) return { inserted: 0, skipped: 0, flagged: 0 };
  if (data.length === 0) return { inserted: 0, skipped: 0, flagged: 0 };

  let inserted = 0, skipped = 0, flagged = 0;

  // Compute all fingerprints upfront
  const withFingerprints = data.map(d => ({
    ...d,
    fingerprint: buildFingerprint({
      source: d.source ?? "manual",
      externalId: d.externalId,
      amount: d.amount,
      date: d.date,
      description: d.description,
    }),
  }));

  // Fetch all existing fingerprints in one query
  const allFingerprints = withFingerprints.map(d => d.fingerprint);
  const { inArray } = await import("drizzle-orm");
  const existingRows = await db.select({ fingerprint: transactions.fingerprint })
    .from(transactions)
    .where(inArray(transactions.fingerprint, allFingerprints));
  const existingSet = new Set(existingRows.map(r => r.fingerprint));

  // Filter out exact duplicates
  const toInsert = withFingerprints.filter(d => !existingSet.has(d.fingerprint!));
  skipped = withFingerprints.length - toInsert.length;

  if (toInsert.length === 0) return { inserted, skipped, flagged };

  // Cross-platform duplicate detection: load same-day transactions once
  // Group by day to minimize queries
  const daysSet = new Set(toInsert.map(d => d.date.toISOString().slice(0, 10)));
  const days = Array.from(daysSet);
  const { gte, lte } = await import("drizzle-orm");
  const existingTxns: Transaction[] = [];
  for (const day of days) {
    const dayStart = new Date(day + "T00:00:00Z");
    const dayEnd = new Date(day + "T23:59:59Z");
    const rows = await db.select().from(transactions)
      .where(and(gte(transactions.date, dayStart), lte(transactions.date, dayEnd)))
      .limit(500);
    existingTxns.push(...rows);
  }

  // Insert in batches of 50 with cross-platform duplicate flags
  const enriched = toInsert.map(d => {
    const dupCheck = detectCrossPlatformDuplicate(d, existingTxns);
    if (dupCheck.isDuplicate) flagged++;
    return {
      ...d,
      isDuplicate: dupCheck.isDuplicate,
      duplicateOfId: dupCheck.duplicateOfId ?? null,
      duplicateReason: dupCheck.reason ?? null,
    };
  });

  for (let i = 0; i < enriched.length; i += 50) {
    await db.insert(transactions).values(enriched.slice(i, i + 50));
    inserted += Math.min(50, enriched.length - i);
  }

  return { inserted, skipped, flagged };
}

export async function updateTransaction(id: number, data: Partial<Transaction>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(transactions).set(data as any).where(eq(transactions.id, id));
}

export async function deleteTransaction(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(transactions).where(eq(transactions.id, id));
}

// ─── Accounting: Tax Settings ─────────────────────────────────────────────────
export async function getTaxSettings(taxYear: number): Promise<TaxSettings | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(taxSettings).where(eq(taxSettings.taxYear, taxYear)).limit(1);
  return rows[0];
}

export async function upsertTaxSettings(data: Partial<TaxSettings> & { taxYear: number }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(taxSettings).values(data as any).onDuplicateKeyUpdate({ set: data as any });
}

// ─── Accounting: P&L Engine ───────────────────────────────────────────────────
export interface PLStatement {
  period: string;
  // Revenue
  productSales: number;
  shippingCollected: number;
  otherIncome: number;
  grossRevenue: number;
  // COGS
  productCost: number;
  shippingCost: number;
  supplierFees: number;
  totalCOGS: number;
  grossProfit: number;
  grossMarginPct: number;
  // Operating Expenses
  platformFees: number;
  paymentProcessing: number;
  advertising: number;
  softwareSubscriptions: number;
  officeSupplies: number;
  professionalServices: number;
  bankCharges: number;
  returnsRefunds: number;
  packaging: number;
  storageFulfillment: number;
  taxesLicenses: number;
  insurance: number;
  educationTraining: number;
  travel: number;
  utilities: number;
  otherExpense: number;
  totalOperatingExpenses: number;
  // Bottom line
  netProfit: number;
  netMarginPct: number;
  // eBay breakdown
  ebayRevenue: number;
  ebayFees: number;
  shopifyRevenue: number;
  shopifyFees: number;
  paypalFees: number;
  adSpend: number;
}

export async function computePL(startDate: Date, endDate: Date): Promise<PLStatement> {
  const txns = await getTransactions({ startDate, endDate });

  const sum = (cat: Transaction["category"], src?: Transaction["source"]) =>
    txns
      .filter(t => t.category === cat && (src ? t.source === src : true))
      .reduce((acc, t) => acc + Math.abs(t.amount), 0);

  const productSales = sum("product_sales");
  const shippingCollected = sum("shipping_collected");
  const otherIncome = sum("other_income");
  const grossRevenue = productSales + shippingCollected + otherIncome;

  const productCost = sum("product_cost");
  const shippingCost = sum("shipping_cost");
  const supplierFees = sum("supplier_fees");
  const totalCOGS = productCost + shippingCost + supplierFees;
  const grossProfit = grossRevenue - totalCOGS;

  const platformFees = sum("platform_fees");
  const paymentProcessing = sum("payment_processing");
  const advertising = sum("advertising");
  const softwareSubscriptions = sum("software_subscriptions");
  const officeSupplies = sum("office_supplies");
  const professionalServices = sum("professional_services");
  const bankCharges = sum("bank_charges");
  const returnsRefunds = sum("returns_refunds");
  const packaging = sum("packaging");
  const storageFulfillment = sum("storage_fulfillment");
  const taxesLicenses = sum("taxes_licenses");
  const insurance = sum("insurance");
  const educationTraining = sum("education_training");
  const travel = sum("travel");
  const utilities = sum("utilities");
  const otherExpense = sum("other_expense");

  const totalOperatingExpenses =
    platformFees + paymentProcessing + advertising + softwareSubscriptions +
    officeSupplies + professionalServices + bankCharges + returnsRefunds +
    packaging + storageFulfillment + taxesLicenses + insurance +
    educationTraining + travel + utilities + otherExpense;

  const netProfit = grossProfit - totalOperatingExpenses;

  // Source breakdowns
  const ebayRevenue = txns.filter(t => t.source === "ebay" && t.type === "income").reduce((a, t) => a + t.amount, 0);
  const ebayFees = txns.filter(t => t.source === "ebay" && (t.type === "fee" || t.type === "expense")).reduce((a, t) => a + Math.abs(t.amount), 0);
  const shopifyRevenue = txns.filter(t => t.source === "shopify" && t.type === "income").reduce((a, t) => a + t.amount, 0);
  const shopifyFees = txns.filter(t => t.source === "shopify" && t.type === "fee").reduce((a, t) => a + Math.abs(t.amount), 0);
  const paypalFees = txns.filter(t => t.source === "paypal" && t.type === "fee").reduce((a, t) => a + Math.abs(t.amount), 0);
  const adSpend = sum("advertising");

  return {
    period: `${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}`,
    productSales, shippingCollected, otherIncome, grossRevenue,
    productCost, shippingCost, supplierFees, totalCOGS, grossProfit,
    grossMarginPct: grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0,
    platformFees, paymentProcessing, advertising, softwareSubscriptions,
    officeSupplies, professionalServices, bankCharges, returnsRefunds,
    packaging, storageFulfillment, taxesLicenses, insurance,
    educationTraining, travel, utilities, otherExpense,
    totalOperatingExpenses,
    netProfit,
    netMarginPct: grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0,
    ebayRevenue, ebayFees, shopifyRevenue, shopifyFees, paypalFees, adSpend,
  };
}

// ─── Accounting: Tax Calculator ───────────────────────────────────────────────
export interface TaxSummary {
  taxYear: number;
  grossRevenue: number;
  totalDeductibleExpenses: number;
  netProfit: number;
  selfEmploymentTax: number;
  seDeduction: number; // 50% of SE tax is deductible
  adjustedNetIncome: number;
  estimatedFederalTax: number;
  estimatedStateTax: number;
  estimatedTotalTax: number;
  effectiveTaxRate: number;
  quarterlyEstimates: { quarter: string; dueDate: string; amount: number }[];
  scheduleC: {
    line: string;
    description: string;
    amount: number;
    taxDeductible: boolean;
  }[];
  deductibleByCategory: { category: string; amount: number; scheduleC: string }[];
}

export async function computeTaxSummary(taxYear: number): Promise<TaxSummary> {
  const startDate = new Date(`${taxYear}-01-01`);
  const endDate = new Date(`${taxYear}-12-31`);
  const settings = await getTaxSettings(taxYear);
  const pl = await computePL(startDate, endDate);
  const txns = await getTransactions({ startDate, endDate });

  const seRate = (settings?.selfEmploymentTaxRate ?? 15.3) / 100;
  const fedRate = (settings?.incomeTaxBracketRate ?? 22) / 100;
  const stateRate = (settings?.stateTaxRate ?? 0) / 100;

  const deductibleExpenses = txns
    .filter(t => t.taxDeductible && (t.type === "expense" || t.type === "fee"))
    .reduce((a, t) => a + Math.abs(t.amount), 0);

  const netProfit = pl.grossRevenue - pl.totalCOGS - deductibleExpenses;
  const selfEmploymentTax = Math.max(0, netProfit * 0.9235 * seRate);
  const seDeduction = selfEmploymentTax * 0.5;
  const adjustedNetIncome = Math.max(0, netProfit - seDeduction);
  const estimatedFederalTax = adjustedNetIncome * fedRate;
  const estimatedStateTax = adjustedNetIncome * stateRate;
  const estimatedTotalTax = selfEmploymentTax + estimatedFederalTax + estimatedStateTax;

  const quarterlyEstimates = [
    { quarter: "Q1", dueDate: `${taxYear}-04-15`, amount: estimatedTotalTax / 4 },
    { quarter: "Q2", dueDate: `${taxYear}-06-17`, amount: estimatedTotalTax / 4 },
    { quarter: "Q3", dueDate: `${taxYear}-09-16`, amount: estimatedTotalTax / 4 },
    { quarter: "Q4", dueDate: `${taxYear + 1}-01-15`, amount: estimatedTotalTax / 4 },
  ];

  // Schedule C line items (IRS Form Schedule C)
  const scheduleC = [
    { line: "Line 1", description: "Gross receipts or sales", amount: pl.grossRevenue, taxDeductible: false },
    { line: "Line 4", description: "Cost of goods sold", amount: pl.totalCOGS, taxDeductible: true },
    { line: "Line 8", description: "Advertising", amount: pl.advertising, taxDeductible: true },
    { line: "Line 10", description: "Commissions and fees (platform fees)", amount: pl.platformFees, taxDeductible: true },
    { line: "Line 17", description: "Legal and professional services", amount: pl.professionalServices, taxDeductible: true },
    { line: "Line 18", description: "Office expenses", amount: pl.officeSupplies, taxDeductible: true },
    { line: "Line 22", description: "Supplies (packaging, materials)", amount: pl.packaging, taxDeductible: true },
    { line: "Line 23", description: "Taxes and licenses", amount: pl.taxesLicenses, taxDeductible: true },
    { line: "Line 24a", description: "Travel", amount: pl.travel, taxDeductible: true },
    { line: "Line 25", description: "Utilities", amount: pl.utilities, taxDeductible: true },
    { line: "Line 27a", description: "Other expenses (subscriptions, bank fees, etc.)", amount: pl.softwareSubscriptions + pl.bankCharges + pl.insurance + pl.educationTraining + pl.otherExpense, taxDeductible: true },
  ];

  const deductibleByCategory = [
    { category: "Advertising (Ads)", amount: pl.advertising, scheduleC: "Line 8" },
    { category: "Platform Fees (Shopify, eBay, PayPal)", amount: pl.platformFees + pl.paymentProcessing, scheduleC: "Line 10" },
    { category: "Product Cost (COGS)", amount: pl.productCost, scheduleC: "Line 4" },
    { category: "Shipping Cost", amount: pl.shippingCost, scheduleC: "Line 4" },
    { category: "Software Subscriptions", amount: pl.softwareSubscriptions, scheduleC: "Line 27a" },
    { category: "Packaging & Supplies", amount: pl.packaging, scheduleC: "Line 22" },
    { category: "Professional Services", amount: pl.professionalServices, scheduleC: "Line 17" },
    { category: "Bank Charges", amount: pl.bankCharges, scheduleC: "Line 27a" },
    { category: "Insurance", amount: pl.insurance, scheduleC: "Line 15" },
    { category: "Travel", amount: pl.travel, scheduleC: "Line 24a" },
    { category: "Education & Training", amount: pl.educationTraining, scheduleC: "Line 27a" },
    { category: "Office Supplies", amount: pl.officeSupplies, scheduleC: "Line 18" },
    { category: "Storage & Fulfillment", amount: pl.storageFulfillment, scheduleC: "Line 27a" },
  ].filter(d => d.amount > 0);

  return {
    taxYear,
    grossRevenue: pl.grossRevenue,
    totalDeductibleExpenses: deductibleExpenses,
    netProfit,
    selfEmploymentTax,
    seDeduction,
    adjustedNetIncome,
    estimatedFederalTax,
    estimatedStateTax,
    estimatedTotalTax,
    effectiveTaxRate: pl.grossRevenue > 0 ? (estimatedTotalTax / pl.grossRevenue) * 100 : 0,
    quarterlyEstimates,
    scheduleC,
    deductibleByCategory,
  };
}

// ─── Integration Token Helpers ────────────────────────────────────────────────
import {
  integrationTokens, IntegrationToken,
  backlinkCampaigns, BacklinkCampaign,
  backlinkOpportunities, BacklinkOpportunity,
  emailCampaigns, EmailCampaign,
  emailProspects, EmailProspect,
  emailEvents, EmailEvent,
  prospectScrapJobs, ProspectScrapJob,
} from "../drizzle/schema";

export async function getIntegrationToken(userId: number, platform: IntegrationToken["platform"]): Promise<IntegrationToken | null> {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(integrationTokens)
    .where(and(eq(integrationTokens.userId, userId), eq(integrationTokens.platform, platform), eq(integrationTokens.isActive, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAllIntegrationTokens(userId: number): Promise<IntegrationToken[]> {
  const db = await getDb(); if (!db) return [];
  return db.select().from(integrationTokens)
    .where(and(eq(integrationTokens.userId, userId), eq(integrationTokens.isActive, true)));
}

export async function upsertIntegrationToken(userId: number, platform: IntegrationToken["platform"], data: Partial<IntegrationToken>): Promise<void> {
  const existing = await getIntegrationToken(userId, platform);
  const db = await getDb(); if (!db) return;
  if (existing) {
    await db.update(integrationTokens).set({ ...data, updatedAt: new Date() }).where(eq(integrationTokens.id, existing.id));
  } else {
    await db.insert(integrationTokens).values({ userId, platform, isActive: true, ...data } as any);
  }
}

export async function deleteIntegrationToken(userId: number, platform: IntegrationToken["platform"]): Promise<void> {
  const db = await getDb(); if (!db) return;
  await db.update(integrationTokens).set({ isActive: false }).where(and(eq(integrationTokens.userId, userId), eq(integrationTokens.platform, platform)));
}

// ─── Backlink Campaign Helpers ────────────────────────────────────────────────
export async function getBacklinkCampaigns(userId: number): Promise<BacklinkCampaign[]> {
  const db = await getDb(); if (!db) return [];
  return db.select().from(backlinkCampaigns).where(eq(backlinkCampaigns.userId, userId)).orderBy(desc(backlinkCampaigns.createdAt));
}

export async function getBacklinkCampaign(id: number): Promise<BacklinkCampaign | null> {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(backlinkCampaigns).where(eq(backlinkCampaigns.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createBacklinkCampaign(data: Omit<BacklinkCampaign, "id" | "createdAt" | "totalLinksFound" | "totalOutreachSent">): Promise<BacklinkCampaign> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const [res] = await db.insert(backlinkCampaigns).values(data as any);
  return (await db.select().from(backlinkCampaigns).where(eq(backlinkCampaigns.id, (res as any).insertId)).limit(1))[0];
}

export async function updateBacklinkCampaign(id: number, data: Partial<BacklinkCampaign>): Promise<void> {
  const db = await getDb(); if (!db) return;
  await db.update(backlinkCampaigns).set(data).where(eq(backlinkCampaigns.id, id));
}

export async function deleteBacklinkCampaign(id: number): Promise<void> {
  const db = await getDb(); if (!db) return;
  await db.delete(backlinkCampaigns).where(eq(backlinkCampaigns.id, id));
}

export async function getBacklinkOpportunities(campaignId: number): Promise<BacklinkOpportunity[]> {
  const db = await getDb(); if (!db) return [];
  return db.select().from(backlinkOpportunities).where(eq(backlinkOpportunities.campaignId, campaignId)).orderBy(desc(backlinkOpportunities.relevanceScore));
}

export async function insertBacklinkOpportunities(items: Omit<BacklinkOpportunity, "id" | "discoveredAt">[]): Promise<void> {
  if (items.length === 0) return;
  const db = await getDb(); if (!db) return;
  await db.insert(backlinkOpportunities).values(items as any[]);
}

export async function updateBacklinkOpportunity(id: number, data: Partial<BacklinkOpportunity>): Promise<void> {
  const db = await getDb(); if (!db) return;
  await db.update(backlinkOpportunities).set(data).where(eq(backlinkOpportunities.id, id));
}

// ─── Email Campaign Helpers ───────────────────────────────────────────────────
export async function getEmailCampaigns(userId: number): Promise<EmailCampaign[]> {
  const db = await getDb(); if (!db) return [];
  return db.select().from(emailCampaigns).where(eq(emailCampaigns.userId, userId)).orderBy(desc(emailCampaigns.createdAt));
}

export async function getEmailCampaign(id: number): Promise<EmailCampaign | null> {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createEmailCampaign(data: Omit<EmailCampaign, "id" | "createdAt" | "updatedAt" | "totalSent" | "totalDelivered" | "totalOpened" | "totalClicked" | "totalBounced" | "totalUnsubscribed">): Promise<EmailCampaign> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const [res] = await db.insert(emailCampaigns).values(data as any);
  return (await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, (res as any).insertId)).limit(1))[0];
}

export async function updateEmailCampaign(id: number, data: Partial<EmailCampaign>): Promise<void> {
  const db = await getDb(); if (!db) return;
  await db.update(emailCampaigns).set({ ...data, updatedAt: new Date() }).where(eq(emailCampaigns.id, id));
}

export async function deleteEmailCampaign(id: number): Promise<void> {
  const db = await getDb(); if (!db) return;
  await db.delete(emailCampaigns).where(eq(emailCampaigns.id, id));
}

// ─── Email Prospect Helpers ───────────────────────────────────────────────────
export async function getEmailProspects(userId: number, opts?: { status?: EmailProspect["status"]; source?: EmailProspect["source"] }): Promise<EmailProspect[]> {
  const db = await getDb(); if (!db) return [];
  return db.select().from(emailProspects).where(eq(emailProspects.userId, userId)).orderBy(desc(emailProspects.addedAt));
}

export async function insertEmailProspects(items: Omit<EmailProspect, "id" | "addedAt">[]): Promise<number> {
  if (items.length === 0) return 0;
  const db = await getDb(); if (!db) return 0;
  const existing = await db.select({ email: emailProspects.email }).from(emailProspects).where(eq(emailProspects.userId, items[0].userId));
  const existingEmails = new Set(existing.map((r: { email: string }) => r.email));
  const newItems = items.filter(i => !existingEmails.has(i.email));
  if (newItems.length === 0) return 0;
  await db.insert(emailProspects).values(newItems as any[]);
  return newItems.length;
}

export async function updateEmailProspect(id: number, data: Partial<EmailProspect>): Promise<void> {
  const db = await getDb(); if (!db) return;
  await db.update(emailProspects).set(data).where(eq(emailProspects.id, id));
}

export async function deleteEmailProspect(id: number): Promise<void> {
  const db = await getDb(); if (!db) return;
  await db.delete(emailProspects).where(eq(emailProspects.id, id));
}

// ─── Email Event Helpers ──────────────────────────────────────────────────────
export async function insertEmailEvent(data: Omit<EmailEvent, "id" | "occurredAt">): Promise<void> {
  const db = await getDb(); if (!db) return;
  await db.insert(emailEvents).values(data as any);
}

export async function getEmailEvents(campaignId: number): Promise<EmailEvent[]> {
  const db = await getDb(); if (!db) return [];
  return db.select().from(emailEvents).where(eq(emailEvents.campaignId, campaignId)).orderBy(desc(emailEvents.occurredAt));
}

export async function getEmailStats(campaignId: number): Promise<{ sent: number; opened: number; clicked: number; bounced: number; unsubscribed: number }> {
  const events = await getEmailEvents(campaignId);
  return {
    sent: events.filter(e => e.event === "sent").length,
    opened: events.filter(e => e.event === "opened").length,
    clicked: events.filter(e => e.event === "clicked").length,
    bounced: events.filter(e => e.event === "bounced").length,
    unsubscribed: events.filter(e => e.event === "unsubscribed").length,
  };
}

// ─── Prospect Scrap Job Helpers ───────────────────────────────────────────────
export async function getProspectScrapJobs(userId: number): Promise<ProspectScrapJob[]> {
  const db = await getDb(); if (!db) return [];
  return db.select().from(prospectScrapJobs).where(eq(prospectScrapJobs.userId, userId)).orderBy(desc(prospectScrapJobs.createdAt));
}

export async function createProspectScrapJob(data: Omit<ProspectScrapJob, "id" | "createdAt" | "prospectsFound">): Promise<ProspectScrapJob> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const [res] = await db.insert(prospectScrapJobs).values(data as any);
  return (await db.select().from(prospectScrapJobs).where(eq(prospectScrapJobs.id, (res as any).insertId)).limit(1))[0];
}

export async function updateProspectScrapJob(id: number, data: Partial<ProspectScrapJob>): Promise<void> {
  const db = await getDb(); if (!db) return;
  await db.update(prospectScrapJobs).set(data).where(eq(prospectScrapJobs.id, id));
}

// ─── Autonomous Config Helpers ────────────────────────────────────────────────
export async function getAutonomousConfig(userId: number, module: AutonomousConfig["module"]): Promise<AutonomousConfig | null> {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(autonomousConfigs)
    .where(and(eq(autonomousConfigs.userId, userId), eq(autonomousConfigs.module, module)))
    .limit(1);
  return rows[0] ?? null;
}
export async function getAllAutonomousConfigs(userId: number): Promise<AutonomousConfig[]> {
  const db = await getDb(); if (!db) return [];
  return db.select().from(autonomousConfigs).where(eq(autonomousConfigs.userId, userId));
}
export async function getAllAutonomousConfigsAll(): Promise<AutonomousConfig[]> {
  const db = await getDb(); if (!db) return [];
  return db.select().from(autonomousConfigs);
}
export async function upsertAutonomousConfig(userId: number, module: AutonomousConfig["module"], data: Partial<AutonomousConfig>): Promise<AutonomousConfig> {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const existing = await getAutonomousConfig(userId, module);
  if (existing) {
    await db.update(autonomousConfigs).set({ ...data, updatedAt: new Date() }).where(eq(autonomousConfigs.id, existing.id));
    return (await getAutonomousConfig(userId, module))!;
  } else {
    const [res] = await db.insert(autonomousConfigs).values({ userId, module, ...data } as any);
    const rows = await db.select().from(autonomousConfigs).where(eq(autonomousConfigs.id, (res as any).insertId)).limit(1);
    return rows[0];
  }
}

// ─── Campaign Product Helpers ─────────────────────────────────────────────────
export async function getCampaignProducts(campaignId: number): Promise<CampaignProduct[]> {
  const db = await getDb(); if (!db) return [];
  return db.select().from(campaignProducts).where(eq(campaignProducts.campaignId, campaignId)).orderBy(campaignProducts.position);
}
export async function setCampaignProducts(campaignId: number, products: Omit<CampaignProduct, "id" | "createdAt">[]): Promise<void> {
  const db = await getDb(); if (!db) return;
  await db.delete(campaignProducts).where(eq(campaignProducts.campaignId, campaignId));
  if (products.length > 0) {
    await db.insert(campaignProducts).values(products as any);
  }
}
