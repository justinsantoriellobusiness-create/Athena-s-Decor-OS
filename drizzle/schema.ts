import {
  boolean,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  bigint,
  float,
} from "drizzle-orm/mysql-core";

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Shopify Integration ──────────────────────────────────────────────────────
export const shopifyConfig = mysqlTable("shopify_config", {
  id: int("id").autoincrement().primaryKey(),
  storeDomain: varchar("storeDomain", { length: 255 }).notNull(),
  accessToken: varchar("accessToken", { length: 512 }).notNull(),
  storefrontToken: varchar("storefrontToken", { length: 512 }),
  isConnected: boolean("isConnected").default(false).notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  productCount: int("productCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ShopifyConfig = typeof shopifyConfig.$inferSelect;

// ─── Automation Settings ──────────────────────────────────────────────────────
export const automationSettings = mysqlTable("automation_settings", {
  id: int("id").autoincrement().primaryKey(),
  module: varchar("module", { length: 64 }).notNull().unique(), // seo | blog | sourcing | inventory | ads
  enabled: boolean("enabled").default(false).notNull(),
  cronExpression: varchar("cronExpression", { length: 64 }).notNull().default("0 0 9 * * *"),
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  lastRunStatus: mysqlEnum("lastRunStatus", ["idle", "running", "success", "error"]).default("idle"),
  lastRunMessage: text("lastRunMessage"),
  taskUid: varchar("taskUid", { length: 128 }),
  config: json("config"), // module-specific config JSON
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AutomationSettings = typeof automationSettings.$inferSelect;

// ─── SEO Keywords ─────────────────────────────────────────────────────────────
export const seoKeywords = mysqlTable("seo_keywords", {
  id: int("id").autoincrement().primaryKey(),
  keyword: varchar("keyword", { length: 255 }).notNull(),
  searchVolume: int("searchVolume").default(0),
  difficulty: int("difficulty").default(0), // 0-100
  cpc: float("cpc").default(0),
  trend: mysqlEnum("trend", ["up", "down", "stable"]).default("stable"),
  category: varchar("category", { length: 128 }),
  source: varchar("source", { length: 64 }).default("ai_research"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SeoKeyword = typeof seoKeywords.$inferSelect;

// ─── SEO Jobs ─────────────────────────────────────────────────────────────────
export const seoJobs = mysqlTable("seo_jobs", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["keyword_research", "product_optimize", "site_audit"]).notNull(),
  status: mysqlEnum("status", ["pending", "running", "success", "error"]).default("pending").notNull(),
  targetId: varchar("targetId", { length: 128 }), // shopify product ID if product_optimize
  result: json("result"),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SeoJob = typeof seoJobs.$inferSelect;

// ─── Blog Posts ───────────────────────────────────────────────────────────────
export const blogPosts = mysqlTable("blog_posts", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 512 }).notNull(),
  slug: varchar("slug", { length: 512 }),
  content: text("content"),
  excerpt: text("excerpt"),
  featuredImageUrl: text("featuredImageUrl"),
  featuredImageKey: text("featuredImageKey"),
  featuredImageAlt: text("featuredImageAlt"),
  tags: json("tags"), // string[]
  seoTitle: varchar("seoTitle", { length: 512 }),
  seoDescription: text("seoDescription"),
  status: mysqlEnum("status", ["draft", "scheduled", "published", "failed"]).default("draft").notNull(),
  shopifyBlogId: varchar("shopifyBlogId", { length: 128 }),
  shopifyArticleId: varchar("shopifyArticleId", { length: 128 }),
  scheduledAt: timestamp("scheduledAt"),
  publishedAt: timestamp("publishedAt"),
  generatedByAi: boolean("generatedByAi").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BlogPost = typeof blogPosts.$inferSelect;

// ─── Sourcing Specs ───────────────────────────────────────────────────────────
export const sourcingSpecs = mysqlTable("sourcing_specs", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  keywords: json("keywords").notNull(), // string[]
  categories: json("categories"), // string[]
  minPrice: float("minPrice"),
  maxPrice: float("maxPrice"),
  minRating: float("minRating"),
  minOrders: int("minOrders"),
  maxShippingDays: int("maxShippingDays"),
  minStockLevel: int("minStockLevel"),
  sources: json("sources").notNull(), // ["dsers","cj","aliexpress"]
  autoOptimizeBeforeImport: boolean("autoOptimizeBeforeImport").default(false),
  status: mysqlEnum("status", ["idle", "running", "completed", "error"]).default("idle").notNull(),
  lastRunAt: timestamp("lastRunAt"),
  resultCount: int("resultCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SourcingSpec = typeof sourcingSpecs.$inferSelect;

// ─── Sourced Products ─────────────────────────────────────────────────────────
export const sourcedProducts = mysqlTable("sourced_products", {
  id: int("id").autoincrement().primaryKey(),
  specId: int("specId").notNull(),
  source: mysqlEnum("source", ["dsers", "cj", "aliexpress"]).notNull(),
  externalId: varchar("externalId", { length: 255 }),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  price: float("price"),
  compareAtPrice: float("compareAtPrice"),
  imageUrl: text("imageUrl"),
  rating: float("rating"),
  orders: int("orders"),
  category: varchar("category", { length: 255 }),
  supplier: varchar("supplier", { length: 255 }),
  shippingTime: varchar("shippingTime", { length: 128 }),
  shippingDays: int("shippingDays"),
  stockLevel: int("stockLevel"),
  aiScore: float("aiScore"),
  aiScoreReason: text("aiScoreReason"),
  isBestPick: boolean("isBestPick").default(false),
  variants: json("variants"),
  importStatus: mysqlEnum("importStatus", ["pending", "importing", "imported", "failed"]).default("pending").notNull(),
  shopifyProductId: varchar("shopifyProductId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // true = fetched from a real supplier API (currently CJ Dropshipping only);
  // false = AI-generated idea/estimate, not a live product listing.
  isVerified: boolean("isVerified").default(false).notNull(),
});

export type SourcedProduct = typeof sourcedProducts.$inferSelect;
// ─── Sourcing App Credentials ─────────────────────────────────────────────────
export const sourcingAppCredentials = mysqlTable("sourcing_app_credentials", {
  id: int("id").autoincrement().primaryKey(),
  app: mysqlEnum("app", ["autods", "cj", "dsers"]).notNull().unique(),
  apiKey: varchar("apiKey", { length: 512 }),
  apiSecret: varchar("apiSecret", { length: 512 }),
  storeId: varchar("storeId", { length: 255 }),
  accessToken: varchar("accessToken", { length: 512 }),
  isConnected: boolean("isConnected").default(false).notNull(),
  lastTestedAt: timestamp("lastTestedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SourcingAppCredential = typeof sourcingAppCredentials.$inferSelect;

// ─── Inventory Snapshots ──────────────────────────────────────────────────────
export const inventorySnapshots = mysqlTable("inventory_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  shopifyProductId: varchar("shopifyProductId", { length: 128 }).notNull(),
  // Unique so repeat scans update the same row (upsert) instead of piling
  // up a new row per variant every run — without this, the "grouped by
  // product" view would show the same variant duplicated once per scan.
  shopifyVariantId: varchar("shopifyVariantId", { length: 128 }).unique(),
  title: varchar("title", { length: 512 }),
  sku: varchar("sku", { length: 255 }),
  // Shopify product slug — lets the UI link straight to the live storefront
  // page, not just the admin edit page (the numeric product id alone can't
  // build a working storefront URL).
  productHandle: varchar("productHandle", { length: 255 }),
  supplierStock: int("supplierStock").default(0),
  shopifyStock: int("shopifyStock").default(0),
  status: mysqlEnum("status", ["in_stock", "low_stock", "out_of_stock", "unknown"]).default("unknown").notNull(),
  autoUpdated: boolean("autoUpdated").default(false),
  lastCheckedAt: timestamp("lastCheckedAt"),
  // Supplier tracking
  supplierName: varchar("supplierName", { length: 255 }),
  supplierSource: mysqlEnum("supplierSource", ["dsers", "cj", "aliexpress", "manual", "unknown"]).default("unknown"),
  supplierProductId: varchar("supplierProductId", { length: 255 }),
  supplierPrice: float("supplierPrice"),
  imageUrl: text("imageUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InventorySnapshot = typeof inventorySnapshots.$inferSelect;

// ─── Ad Campaigns ─────────────────────────────────────────────────────────────
export const adCampaigns = mysqlTable("ad_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  platform: mysqlEnum("platform", ["facebook", "instagram", "google", "tiktok"]).notNull(),
  status: mysqlEnum("status", ["draft", "active", "paused", "completed", "error"]).default("draft").notNull(),
  objective: varchar("objective", { length: 128 }),
  dailyBudget: float("dailyBudget"),
  totalBudget: float("totalBudget"),
  spent: float("spent").default(0),
  impressions: bigint("impressions", { mode: "number" }).default(0),
  clicks: bigint("clicks", { mode: "number" }).default(0),
  conversions: int("conversions").default(0),
  roas: float("roas").default(0),
  ctr: float("ctr").default(0),
  cpc: float("cpc").default(0),
  targeting: json("targeting"),
  externalCampaignId: varchar("externalCampaignId", { length: 255 }),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  lastOptimizedAt: timestamp("lastOptimizedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AdCampaign = typeof adCampaigns.$inferSelect;

// ─── Ad Creatives ─────────────────────────────────────────────────────────────
export const adCreatives = mysqlTable("ad_creatives", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId"),
  type: mysqlEnum("type", ["product_image", "ugc", "carousel", "video_thumbnail"]).notNull(),
  headline: varchar("headline", { length: 255 }),
  bodyText: text("bodyText"),
  ctaText: varchar("ctaText", { length: 128 }),
  imageUrl: text("imageUrl"),
  imageKey: text("imageKey"),
  sourceProductId: varchar("sourceProductId", { length: 128 }),
  sourceImageUrl: text("sourceImageUrl"),
  aiPrompt: text("aiPrompt"),
  status: mysqlEnum("status", ["generating", "ready", "in_use", "archived"]).default("generating").notNull(),
  performance: json("performance"), // { impressions, clicks, ctr, conversions }
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AdCreative = typeof adCreatives.$inferSelect;

// ─── Site Audit Runs ─────────────────────────────────────────────────────────
export const siteAuditRuns = mysqlTable("site_audit_runs", {
  id: int("id").autoincrement().primaryKey(),
  status: mysqlEnum("status", ["running", "completed", "error"]).default("running").notNull(),
  overallScore: int("overallScore"), // 0-100
  seoScore: int("seoScore"),
  croScore: int("croScore"),
  technicalScore: int("technicalScore"),
  pageCount: int("pageCount").default(0),
  issueCount: int("issueCount").default(0),
  criticalCount: int("criticalCount").default(0),
  warningCount: int("warningCount").default(0),
  infoCount: int("infoCount").default(0),
  summary: text("summary"),
  errorMessage: text("errorMessage"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SiteAuditRun = typeof siteAuditRuns.$inferSelect;

// ─── Site Audit Issues ────────────────────────────────────────────────────────
export const siteAuditIssues = mysqlTable("site_audit_issues", {
  id: int("id").autoincrement().primaryKey(),
  runId: int("runId").notNull(),
  pageType: mysqlEnum("pageType", ["product", "collection", "page", "blog", "article", "homepage"]).notNull(),
  pageId: varchar("pageId", { length: 128 }),
  pageTitle: varchar("pageTitle", { length: 512 }),
  pageUrl: text("pageUrl"),
  issueType: mysqlEnum("issueType", [
    "missing_title", "short_title", "long_title",
    "missing_meta", "short_meta", "long_meta",
    "missing_alt", "duplicate_content", "thin_content",
    "missing_h1", "keyword_stuffing", "low_readability",
    "missing_schema", "broken_link", "slow_page",
    "low_cro", "weak_cta", "poor_description"
  ]).notNull(),
  severity: mysqlEnum("severity", ["critical", "warning", "info"]).notNull(),
  description: text("description"),
  suggestion: text("suggestion"),
  currentValue: text("currentValue"),
  suggestedValue: text("suggestedValue"),
  status: mysqlEnum("status", ["open", "fixed", "ignored", "pending_fix"]).default("open").notNull(),
  fixAppliedAt: timestamp("fixAppliedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SiteAuditIssue = typeof siteAuditIssues.$inferSelect;

// ─── Accounting: Financial Accounts ──────────────────────────────────────────
export const financialAccounts = mysqlTable("financial_accounts", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  provider: mysqlEnum("provider", [
    "shopify", "paypal", "ebay", "stripe", "bank", "credit_card",
    "amazon", "etsy", "dsers", "cj_dropshipping", "facebook_ads",
    "google_ads", "tiktok_ads", "other"
  ]).notNull(),
  accountType: mysqlEnum("accountType", [
    "revenue", "expense", "bank", "credit_card", "marketplace", "ad_platform", "payment_processor"
  ]).notNull(),
  currency: varchar("currency", { length: 8 }).default("USD").notNull(),
  currentBalance: float("currentBalance").default(0),
  credentials: json("credentials"), // encrypted API keys / tokens
  isConnected: boolean("isConnected").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  lastSyncedAt: timestamp("lastSyncedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FinancialAccount = typeof financialAccounts.$inferSelect;

// ─── Accounting: Transactions ─────────────────────────────────────────────────
export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  date: timestamp("date").notNull(),
  description: varchar("description", { length: 512 }).notNull(),
  amount: float("amount").notNull(), // positive = income, negative = expense
  type: mysqlEnum("type", ["income", "expense", "refund", "fee", "transfer", "adjustment"]).notNull(),
  // Top-level category (maps to Schedule C lines for taxes)
  category: mysqlEnum("category", [
    // Revenue
    "product_sales", "shipping_collected", "other_income",
    // COGS
    "product_cost", "shipping_cost", "supplier_fees",
    // Operating Expenses
    "platform_fees", "payment_processing", "advertising",
    "software_subscriptions", "office_supplies", "professional_services",
    "bank_charges", "returns_refunds", "packaging",
    "storage_fulfillment", "taxes_licenses", "insurance",
    "education_training", "travel", "utilities", "other_expense"
  ]).notNull(),
  // Subcategory for more detail
  subcategory: varchar("subcategory", { length: 128 }),
  // Source platform
  source: mysqlEnum("source", [
    "shopify", "paypal", "ebay", "stripe", "bank", "credit_card",
    "facebook_ads", "google_ads", "tiktok_ads", "dsers", "cj_dropshipping",
    "manual", "other"
  ]).notNull().default("manual"),
  // Tax fields
  taxDeductible: boolean("taxDeductible").default(false).notNull(),
  taxCategory: varchar("taxCategory", { length: 128 }), // Schedule C line reference
  // eBay-specific fee fields
  ebayFeeType: mysqlEnum("ebayFeeType", [
    "final_value_fee", "insertion_fee", "promoted_listing_fee",
    "shipping_label_fee", "international_fee", "dispute_fee",
    "store_subscription", "other_ebay_fee"
  ]),
  // Reference
  externalId: varchar("externalId", { length: 255 }), // order ID / transaction ID from source
  orderId: varchar("orderId", { length: 255 }),
  notes: text("notes"),
  isReconciled: boolean("isReconciled").default(false).notNull(),
  // Deduplication: SHA-256 of source+externalId+amount+date to prevent double-counting
  fingerprint: varchar("fingerprint", { length: 64 }).unique(),
  // If true, this transaction is a detected duplicate and excluded from P&L/tax
  isDuplicate: boolean("isDuplicate").default(false).notNull(),
  // Reference to the original transaction this duplicates (if known)
  duplicateOfId: int("duplicateOfId"),
  // Human-readable explanation of why it was flagged
  duplicateReason: varchar("duplicateReason", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

// ─── Accounting: Tax Settings ─────────────────────────────────────────────────
export const taxSettings = mysqlTable("tax_settings", {
  id: int("id").autoincrement().primaryKey(),
  taxYear: int("taxYear").notNull(),
  businessName: varchar("businessName", { length: 255 }),
  ein: varchar("ein", { length: 20 }), // Employer Identification Number
  ssn: varchar("ssn", { length: 20 }), // SSN (last 4 only, for reference)
  filingStatus: mysqlEnum("filingStatus", [
    "sole_proprietor", "llc_single", "llc_partnership", "s_corp", "c_corp"
  ]).default("sole_proprietor").notNull(),
  stateCode: varchar("stateCode", { length: 4 }),
  selfEmploymentTaxRate: float("selfEmploymentTaxRate").default(15.3), // SE tax %
  incomeTaxBracketRate: float("incomeTaxBracketRate").default(22), // federal bracket %
  stateTaxRate: float("stateTaxRate").default(0),
  quarterlyDueDates: json("quarterlyDueDates"), // array of date strings
  homeOfficeDeduction: boolean("homeOfficeDeduction").default(false),
  homeOfficePercent: float("homeOfficePercent").default(0),
  vehicleDeduction: boolean("vehicleDeduction").default(false),
  vehicleMiles: int("vehicleMiles").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TaxSettings = typeof taxSettings.$inferSelect;

// ─── Bulk Product Optimization ────────────────────────────────────────────────
export const bulkOptimizationJobs = mysqlTable("bulk_optimization_jobs", {
  id: int("id").autoincrement().primaryKey(),
  status: mysqlEnum("status", ["pending", "running", "completed", "cancelled", "failed"])
    .default("pending").notNull(),
  totalProducts: int("totalProducts").default(0).notNull(),
  completedProducts: int("completedProducts").default(0).notNull(),
  errorCount: int("errorCount").default(0).notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BulkOptimizationJob = typeof bulkOptimizationJobs.$inferSelect;

export const optimizationQueue = mysqlTable("optimization_queue", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  shopifyProductId: varchar("shopifyProductId", { length: 64 }).notNull(),
  originalTitle: text("originalTitle"),
  originalDescription: text("originalDescription"),
  originalMetaTitle: text("originalMetaTitle"),
  originalMetaDescription: text("originalMetaDescription"),
  optimizedTitle: text("optimizedTitle"),
  optimizedDescription: text("optimizedDescription"),
  metaTitle: varchar("metaTitle", { length: 70 }),       // SEO: ≤60 chars ideal
  metaDescription: varchar("metaDescription", { length: 170 }), // SEO: ≤160 chars ideal
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed", "skipped"])
    .default("pending").notNull(),
  errorMessage: text("errorMessage"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type OptimizationQueueItem = typeof optimizationQueue.$inferSelect;

// ─── Audit Fix Log ────────────────────────────────────────────────────────────
export const auditFixLog = mysqlTable("audit_fix_log", {
  id: int("id").autoincrement().primaryKey(),
  auditRunId: int("auditRunId").notNull(),
  issueId: int("issueId").notNull(),
  pageType: varchar("pageType", { length: 64 }),
  pageId: varchar("pageId", { length: 128 }),
  pageTitle: text("pageTitle"),
  fieldChanged: varchar("fieldChanged", { length: 128 }).notNull(),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  fixType: varchar("fixType", { length: 64 }),  // e.g. "alt_text", "meta_description", "title"
  appliedAt: timestamp("appliedAt").defaultNow().notNull(),
  status: mysqlEnum("status", ["applied", "failed", "rolled_back"]).default("applied").notNull(),
  errorMessage: text("errorMessage"),
});
export type AuditFixLog = typeof auditFixLog.$inferSelect;


// ─── OAuth Integration Tokens ─────────────────────────────────────────────────
// Stores OAuth tokens for connected platforms (Shopify, eBay, PayPal, etc.)
export const integrationTokens = mysqlTable("integration_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  platform: mysqlEnum("platform", ["shopify", "ebay", "paypal", "google", "facebook", "tiktok", "autods", "cj_dropshipping", "dsers"]).notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  tokenExpiry: timestamp("tokenExpiry"),
  shopDomain: varchar("shopDomain", { length: 255 }),  // for Shopify
  scopes: text("scopes"),
  metadata: text("metadata"),  // JSON blob for platform-specific data
  isActive: boolean("isActive").default(true).notNull(),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type IntegrationToken = typeof integrationTokens.$inferSelect;

// ─── Backlinks ────────────────────────────────────────────────────────────────
export const backlinkCampaigns = mysqlTable("backlink_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  targetUrl: text("targetUrl").notNull(),  // your store/product/blog URL
  anchorText: varchar("anchorText", { length: 255 }),
  keywords: text("keywords"),  // comma-separated target keywords
  niche: varchar("niche", { length: 128 }),
  status: mysqlEnum("status", ["active", "paused", "completed"]).default("active").notNull(),
  automationEnabled: boolean("automationEnabled").default(false).notNull(),
  frequencyDays: int("frequencyDays").default(7).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  totalLinksFound: int("totalLinksFound").default(0).notNull(),
  totalOutreachSent: int("totalOutreachSent").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BacklinkCampaign = typeof backlinkCampaigns.$inferSelect;

export const backlinkOpportunities = mysqlTable("backlink_opportunities", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  userId: int("userId").notNull(),
  siteUrl: text("siteUrl").notNull(),
  siteName: varchar("siteName", { length: 255 }),
  pageTitle: text("pageTitle"),
  pageUrl: text("pageUrl").notNull(),
  domainAuthority: int("domainAuthority").default(0),
  relevanceScore: int("relevanceScore").default(0),  // 0-100
  seoValue: mysqlEnum("seoValue", ["high", "medium", "low"]).default("medium"),
  type: mysqlEnum("type", ["news", "blog", "forum", "directory", "social", "competitor"]).default("blog"),
  status: mysqlEnum("status", ["new", "outreach_sent", "linked", "rejected", "pending"]).default("new").notNull(),
  outreachEmail: varchar("outreachEmail", { length: 255 }),
  outreachMessage: text("outreachMessage"),
  outreachSentAt: timestamp("outreachSentAt"),
  linkedAt: timestamp("linkedAt"),
  notes: text("notes"),
  discoveredAt: timestamp("discoveredAt").defaultNow().notNull(),
});
export type BacklinkOpportunity = typeof backlinkOpportunities.$inferSelect;

// ─── Email Campaigns ──────────────────────────────────────────────────────────
export const emailCampaigns = mysqlTable("email_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 512 }).notNull(),
  previewText: varchar("previewText", { length: 255 }),
  bodyHtml: text("bodyHtml"),
  bodyText: text("bodyText"),
  fromName: varchar("fromName", { length: 128 }),
  fromEmail: varchar("fromEmail", { length: 255 }),
  replyTo: varchar("replyTo", { length: 255 }),
  type: mysqlEnum("type", ["promotional", "newsletter", "drip", "winback", "abandoned_cart", "welcome"]).default("promotional").notNull(),
  status: mysqlEnum("status", ["draft", "scheduled", "sending", "sent", "paused"]).default("draft").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  sentAt: timestamp("sentAt"),
  automationEnabled: boolean("automationEnabled").default(false).notNull(),
  frequencyDays: int("frequencyDays").default(30),
  nextSendAt: timestamp("nextSendAt"),
  totalRecipients: int("totalRecipients").default(0).notNull(),
  totalSent: int("totalSent").default(0).notNull(),
  totalDelivered: int("totalDelivered").default(0).notNull(),
  totalOpened: int("totalOpened").default(0).notNull(),
  totalClicked: int("totalClicked").default(0).notNull(),
  totalBounced: int("totalBounced").default(0).notNull(),
  totalUnsubscribed: int("totalUnsubscribed").default(0).notNull(),
  // Subject-line A/B test: when set, half the recipient list gets `subject`,
  // half gets `variantBSubject` (body is identical for both) — winner is
  // read off per-variant open/click counts on email_events.variant.
  abTestEnabled: boolean("abTestEnabled").default(false).notNull(),
  variantBSubject: varchar("variantBSubject", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EmailCampaign = typeof emailCampaigns.$inferSelect;

export const emailProspects = mysqlTable("email_prospects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  firstName: varchar("firstName", { length: 128 }),
  lastName: varchar("lastName", { length: 128 }),
  company: varchar("company", { length: 255 }),
  website: varchar("website", { length: 512 }),
  source: mysqlEnum("source", ["competitor_scrape", "manual", "shopify_customer", "form_signup", "import"]).default("manual").notNull(),
  sourceDetail: varchar("sourceDetail", { length: 255 }),  // e.g. competitor domain
  tags: text("tags"),  // comma-separated
  status: mysqlEnum("status", ["active", "unsubscribed", "bounced", "spam"]).default("active").notNull(),
  score: int("score").default(50),  // 0-100 prospect quality score
  lastContactedAt: timestamp("lastContactedAt"),
  addedAt: timestamp("addedAt").defaultNow().notNull(),
});
export type EmailProspect = typeof emailProspects.$inferSelect;

export const emailEvents = mysqlTable("email_events", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  prospectId: int("prospectId").notNull(),
  userId: int("userId").notNull(),
  event: mysqlEnum("event", ["sent", "delivered", "opened", "clicked", "bounced", "unsubscribed", "spam"]).notNull(),
  clickUrl: text("clickUrl"),
  userAgent: text("userAgent"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  // Which A/B subject-line variant this event belongs to ("a"/"b"), null for
  // non-A/B campaigns.
  variant: varchar("variant", { length: 1 }),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
});
export type EmailEvent = typeof emailEvents.$inferSelect;

export const prospectScrapJobs = mysqlTable("prospect_scrap_jobs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  competitorDomain: varchar("competitorDomain", { length: 255 }).notNull(),
  method: mysqlEnum("method", ["social_followers", "review_sites", "blog_comments", "forum_posts", "linkedin"]).default("review_sites").notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  prospectsFound: int("prospectsFound").default(0).notNull(),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ProspectScrapJob = typeof prospectScrapJobs.$inferSelect;

// ─── Autonomous Module Configs ────────────────────────────────────────────────
// Stores per-module autonomous operation settings (email, backlinker, blog, scraper)
export const autonomousConfigs = mysqlTable("autonomous_configs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  module: mysqlEnum("module", ["email_scraper","email_campaigns","backlinker","blog","seo","site_audit","product_sourcing","inventory","ads","accounting","ai_code_assistant"]).notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  frequencyHours: int("frequencyHours").default(24).notNull(), // how often to run
  lastAutoRunAt: timestamp("lastAutoRunAt"),
  nextAutoRunAt: timestamp("nextAutoRunAt"),
  config: json("config"), // module-specific JSON: keywords, niche, target count, etc.
  taskUid: varchar("taskUid", { length: 128 }), // heartbeat job UID
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AutonomousConfig = typeof autonomousConfigs.$inferSelect;

// ─── Campaign Product Links ───────────────────────────────────────────────────
// Stores product links/images embedded in email campaigns
export const campaignProducts = mysqlTable("campaign_products", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  shopifyProductId: varchar("shopifyProductId", { length: 128 }).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  imageUrl: text("imageUrl"),
  productUrl: text("productUrl"),
  price: varchar("price", { length: 64 }),
  description: text("description"),
  position: int("position").default(0).notNull(), // order in email
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CampaignProduct = typeof campaignProducts.$inferSelect;

// ─── Wix 360 Integration ──────────────────────────────────────────────────────
export const wixConfig = mysqlTable("wix_config", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  accountId: varchar("accountId", { length: 255 }).notNull(),
  apiKey: text("apiKey").notNull(),  // encrypted
  siteUrl: varchar("siteUrl", { length: 512 }).notNull(),
  isConnected: boolean("isConnected").default(false).notNull(),
  productCount: int("productCount").default(0).notNull(),
  orderCount: int("orderCount").default(0).notNull(),
  customerCount: int("customerCount").default(0).notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  lastSyncStatus: mysqlEnum("lastSyncStatus", ["success", "failed", "pending"]).default("pending"),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WixConfig = typeof wixConfig.$inferSelect;

export const wixProducts = mysqlTable("wix_products", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  wixId: varchar("wixId", { length: 255 }).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  price: varchar("price", { length: 64 }),
  inventory: int("inventory").default(0),
  imageUrl: text("imageUrl"),
  shopifyProductId: varchar("shopifyProductId", { length: 128 }),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WixProduct = typeof wixProducts.$inferSelect;

export const wixOrders = mysqlTable("wix_orders", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  wixId: varchar("wixId", { length: 255 }).notNull(),
  customerId: varchar("customerId", { length: 255 }),
  total: varchar("total", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["pending", "processing", "completed", "cancelled", "refunded"]).default("pending").notNull(),
  items: json("items"),  // array of {productId, title, quantity, price}
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  syncedAt: timestamp("syncedAt"),
});
export type WixOrder = typeof wixOrders.$inferSelect;

export const wixAnalytics = mysqlTable("wix_analytics", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
  visitors: int("visitors").default(0),
  pageViews: int("pageViews").default(0),
  conversions: int("conversions").default(0),
  revenue: varchar("revenue", { length: 64 }).default("0"),
  averageOrderValue: varchar("averageOrderValue", { length: 64 }).default("0"),
  conversionRate: varchar("conversionRate", { length: 64 }).default("0"),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
});
export type WixAnalytics = typeof wixAnalytics.$inferSelect;

// ─── Zapier Integration ───────────────────────────────────────────────────────
export const zapierConfig = mysqlTable("zapier_config", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  apiKey: text("apiKey").notNull(),  // encrypted
  isConnected: boolean("isConnected").default(false).notNull(),
  webhookUrl: text("webhookUrl"),
  connectedPlatforms: text("connectedPlatforms"),  // JSON array of connected platforms
  lastSyncAt: timestamp("lastSyncAt"),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ZapierConfig = typeof zapierConfig.$inferSelect;

export const zapierWebhooks = mysqlTable("zapier_webhooks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  zapId: varchar("zapId", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  trigger: varchar("trigger", { length: 128 }).notNull(),  // e.g., "shopify.new_order"
  action: varchar("action", { length: 128 }).notNull(),  // e.g., "accounting.create_transaction"
  isActive: boolean("isActive").default(true).notNull(),
  lastTriggeredAt: timestamp("lastTriggeredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ZapierWebhook = typeof zapierWebhooks.$inferSelect;

// ─── Activity Log ──────────────────────────────────────────────────────────
// Every automation run (scheduled, autonomous, or manually triggered) writes
// here so the app can show real proof of what happened, when, and with what
// result — not just a "success" badge with no detail behind it.
export const activityLog = mysqlTable("activity_log", {
  id: int("id").autoincrement().primaryKey(),
  module: varchar("module", { length: 64 }).notNull(), // e.g. "fulfillment", "seo", "inventory"
  level: mysqlEnum("level", ["info", "success", "warning", "error"]).default("info").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  detail: text("detail"), // human-readable specifics: what was found/created/changed
  metadata: json("metadata"), // structured extras (counts, ids, links) for richer UI rendering
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ActivityLog = typeof activityLog.$inferSelect;
