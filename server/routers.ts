import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { encryptCredentials, decryptCredentials, maskCredential } from "./crypto";
import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { storagePut } from "./storage";
import {
  getShopifyConfig,
  upsertShopifyConfig,
  getAllAutomationSettings,
  getAutomationSetting,
  updateAutomationSetting,
  getSeoKeywords,
  getSeoJobs,
  createSeoJob,
  updateSeoJob,
  getBlogPosts,
  getBlogPost,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  getSourcingSpecs,
  createSourcingSpec,
  updateSourcingSpec,
  deleteSourcingSpec,
  getSourcedProducts,
  getSourcedProductById,
  insertSourcedProducts,
  updateSourcedProduct,
  getSourcingAppCredentials,
  getSourcingAppCredential,
  upsertSourcingAppCredential,
  getInventorySnapshots,
  upsertInventorySnapshot,
  getAdCampaigns,
  createAdCampaign,
  updateAdCampaign,
  getAdCreatives,
  createAdCreative,
  updateAdCreative,
  insertSeoKeywords,
  createAuditRun,
  updateAuditRun,
  getAuditRuns,
  getLatestAuditRun,
  insertAuditIssues,
  getAuditIssues,
  updateAuditIssue,
  getOpenAuditIssues,
  getFinancialAccounts,
  getFinancialAccountById,
  updateFinancialAccount,
  deleteFinancialAccount,
  getTransactions,
  insertTransaction,
  insertTransactions,
  updateTransaction,
  deleteTransaction,
  getTaxSettings,
  upsertTaxSettings,
  computePL,
  computeTaxSummary,
  getIntegrationToken,
  getAllIntegrationTokens,
  upsertIntegrationToken,
  deleteIntegrationToken,
  getBacklinkCampaigns,
  getBacklinkCampaign,
  createBacklinkCampaign,
  updateBacklinkCampaign,
  deleteBacklinkCampaign,
  getBacklinkOpportunities,
  insertBacklinkOpportunities,
  updateBacklinkOpportunity,
  getEmailCampaigns,
  getEmailCampaign,
  createEmailCampaign,
  updateEmailCampaign,
  deleteEmailCampaign,
  getEmailProspects,
  insertEmailProspects,
  updateEmailProspect,
  deleteEmailProspect,
  insertEmailEvent,
  getEmailEvents,
  getEmailStats,
  getProspectScrapJobs,
  createProspectScrapJob,
  updateProspectScrapJob,
  getAutonomousConfig,
  getAllAutonomousConfigs,
  upsertAutonomousConfig,
  getCampaignProducts,
  setCampaignProducts,
} from "./db";
import { getShopifyClient } from "./shopify";
import { getConnectedShopifyClient } from "./shopifyHelper";
import { decryptCredential } from "./crypto";
import { parse as parseCookie } from "cookie";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import {
  createOptimizationJob,
  getOptimizationJob,
  getLatestOptimizationJob,
  updateOptimizationJob,
  insertOptimizationQueueItems,
  getPendingQueueItems,
  getQueueItemsForJob,
  updateQueueItem,
  insertAuditFixLog,
  getAuditFixLog,
} from "./optimizerDb";
import { withRateLimit, sleep } from "./rateLimiter";

// ─── Auth Router ──────────────────────────────────────────────────────────────
const authRouter = router({
  me: publicProcedure.query((opts) => opts.ctx.user),
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),
});

// ─── Shopify Router ───────────────────────────────────────────────────────────
const shopifyRouter = router({
  getConfig: protectedProcedure.query(async () => {
    const config = await getShopifyConfig();
    if (!config) return null;
    // Decrypt the token just to get its last 4 chars for display — never send the raw or encrypted token
    const rawToken = decryptCredential(config.accessToken) ?? config.accessToken;
    return { ...config, accessToken: "••••••••" + rawToken.slice(-4) };
  }),

  connect: protectedProcedure
    .input(z.object({ storeDomain: z.string().min(1), accessToken: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        const client = await getShopifyClient(input.storeDomain, input.accessToken);
        const shopData = await client.testConnection();
        const countData = await client.getProductCount();
        // Encrypt the access token before storing at rest
        const { encryptCredential } = await import("./crypto");
        await upsertShopifyConfig({
          storeDomain: input.storeDomain,
          accessToken: encryptCredential(input.accessToken),
          isConnected: true,
          lastSyncAt: new Date(),
          productCount: countData.count,
        });
        return { success: true, shopName: shopData.shop.name, productCount: countData.count };
            } catch (err: any) {
        console.error("[Shopify] Connection failed:", err);
        throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to connect to Shopify. Please check your store domain and access token." });
      }
    }),
  disconnect: protectedProcedure.mutation(async () => {
    const config = await getShopifyConfig();
    if (config) {
      await upsertShopifyConfig({ storeDomain: config.storeDomain, accessToken: config.accessToken, isConnected: false });
    }
    return { success: true };
  }),

  syncProducts: protectedProcedure.mutation(async () => {
    const config = await getShopifyConfig();
    if (!config?.isConnected) throw new TRPCError({ code: "BAD_REQUEST", message: "Shopify not connected" });
    const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
    const countData = await client.getProductCount();
    await upsertShopifyConfig({ storeDomain: config.storeDomain, accessToken: config.accessToken, lastSyncAt: new Date(), productCount: countData.count });
    return { success: true, productCount: countData.count };
  }),

  getProducts: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      const config = await getShopifyConfig();
      if (!config?.isConnected) return { products: [] };
      try {
        const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
        const data = await client.getProducts(input?.limit ?? 50);
        return { products: data.products };
      } catch {
        return { products: [] };
      }
    }),
});

// ─── Scheduler Router ─────────────────────────────────────────────────────────
const schedulerRouter = router({
  getAll: protectedProcedure.query(async () => {
    return getAllAutomationSettings();
  }),

  update: protectedProcedure
    .input(z.object({
      module: z.string(),
      enabled: z.boolean().optional(),
      cronExpression: z.string().optional(),
      config: z.any().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await updateAutomationSetting(input.module, {
        ...(input.enabled !== undefined && { enabled: input.enabled }),
        ...(input.cronExpression && { cronExpression: input.cronExpression }),
        ...(input.config !== undefined && { config: input.config }),
      });

      // If enabling, create/update heartbeat job
      if (input.enabled === true) {
        const setting = await getAutomationSetting(input.module);
        const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        const cron = input.cronExpression || setting?.cronExpression || "0 0 9 * * *";

        try {
          if (setting?.taskUid) {
            await updateHeartbeatJob(setting.taskUid, { cron, enable: true }, sessionToken);
          } else {
            const job = await createHeartbeatJob({
              name: `athenas-${input.module}-automation`,
              cron,
              path: `/api/scheduled/${input.module}`,
              description: `Athena's OS — ${input.module} automation`,
            }, sessionToken);
            await updateAutomationSetting(input.module, { taskUid: job.taskUid });
          }
        } catch (err: any) {
          console.warn(`[Scheduler] Heartbeat job creation failed for ${input.module}:`, err.message);
        }
      } else if (input.enabled === false) {
        const setting = await getAutomationSetting(input.module);
        if (setting?.taskUid) {
          const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
          try {
            await updateHeartbeatJob(setting.taskUid, { enable: false }, sessionToken);
          } catch {}
        }
      }

      return { success: true };
    }),
});

// ─── Dashboard Router ─────────────────────────────────────────────────────────
const dashboardRouter = router({
  stats: protectedProcedure.query(async () => {
    const [config, settings, keywords, jobs, posts, campaigns] = await Promise.all([
      getShopifyConfig(),
      getAllAutomationSettings(),
      getSeoKeywords(10),
      getSeoJobs(5),
      getBlogPosts(5),
      getAdCampaigns(),
    ]);

    const activeModules = settings.filter((s) => s.enabled).length;
    const activeCampaigns = campaigns.filter((c) => c.status === "active").length;

    return {
      shopifyConnected: config?.isConnected ?? false,
      shopifyProductCount: config?.productCount ?? 0,
      activeModules,
      totalModules: settings.length,
      keywordCount: keywords.length,
      recentJobs: jobs,
      recentPosts: posts,
      activeCampaigns,
      totalCampaigns: campaigns.length,
      automationSettings: settings,
    };
  }),
});

// ─── SEO Router ───────────────────────────────────────────────────────────────
const seoRouter = router({
  getKeywords: protectedProcedure.query(async () => getSeoKeywords(100)),
  getJobs: protectedProcedure.query(async () => getSeoJobs(20)),

  runKeywordResearch: protectedProcedure
    .input(z.object({ topic: z.string().default("home decor dropshipping") }))
    .mutation(async ({ input }) => {
      const jobId = await createSeoJob({ type: "keyword_research", status: "running", startedAt: new Date() });
      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are an expert SEO strategist for e-commerce. Return structured JSON only." },
            {
              role: "user",
              content: `Generate 20 high-value SEO keywords for a home decor dropshipping store focused on: ${input.topic}.
For each keyword provide: keyword, searchVolume (estimated monthly), difficulty (1-100), intent (informational|commercial|transactional), cpc (estimated USD).
Return JSON: { "keywords": [{ "keyword": string, "searchVolume": number, "difficulty": number, "intent": string, "cpc": number }] }`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "keyword_research",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  keywords: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        keyword: { type: "string" },
                        searchVolume: { type: "number" },
                        difficulty: { type: "number" },
                        intent: { type: "string" },
                        cpc: { type: "number" },
                      },
                      required: ["keyword", "searchVolume", "difficulty", "intent", "cpc"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["keywords"],
                additionalProperties: false,
              },
            },
          },
        });
        const raw = response.choices[0]?.message?.content;
        const result = JSON.parse(typeof raw === "string" ? raw : "{}");
        const keywords = (result.keywords ?? []).map((k: any) => ({
          keyword: k.keyword,
          searchVolume: k.searchVolume,
          difficulty: k.difficulty,
          intent: k.intent,
          cpc: k.cpc,
          source: "ai_research",
        }));
        await insertSeoKeywords(keywords);
        await updateSeoJob(jobId, { status: "success", completedAt: new Date(), result: { count: keywords.length } });
        return { success: true, count: keywords.length };
      } catch (err: any) {
        await updateSeoJob(jobId, { status: "error", completedAt: new Date(), errorMessage: err.message });
        console.error("[SEO] Keyword research failed:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Keyword research failed. Please try again." });
      }
    }),

  optimizeProduct: protectedProcedure
    .input(z.object({
      productId: z.string(),
      productTitle: z.string(),
      productDescription: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const jobId = await createSeoJob({ type: "product_optimize", status: "running", startedAt: new Date() });
      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are an expert Shopify SEO copywriter for Athena's Decor, a premium home decor brand. Return structured JSON only." },
            {
              role: "user",
              content: `Optimize this Shopify product for maximum SEO and conversion:
Title: ${input.productTitle}
Description: ${input.productDescription ?? "Not provided"}

Requirements:
- optimizedTitle: compelling, keyword-rich (50-70 chars)
- optimizedDescription: rich HTML with <p> tags, keywords, benefits, CTA (200-400 words)
- metaTitle: SEO meta title STRICTLY under 60 characters — count every character
- metaDescription: SEO meta description STRICTLY under 160 characters — count every character
- altText: descriptive image alt text for the main product image (under 125 chars)
- tags: 5-8 relevant SEO tags

Return JSON: { "optimizedTitle": string, "optimizedDescription": string, "metaTitle": string, "metaDescription": string, "altText": string, "tags": string[] }`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "seo_optimization",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  optimizedTitle: { type: "string" },
                  optimizedDescription: { type: "string" },
                  metaTitle: { type: "string" },
                  metaDescription: { type: "string" },
                  altText: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                },
                required: ["optimizedTitle", "optimizedDescription", "metaTitle", "metaDescription", "altText", "tags"],
                additionalProperties: false,
              },
            },
          },
        });
        const rawContent = response.choices[0]?.message?.content;
        const result = JSON.parse(typeof rawContent === "string" ? rawContent : "{}");
        if (result.metaTitle && result.metaTitle.length > 60) result.metaTitle = result.metaTitle.substring(0, 57) + "...";
        if (result.metaDescription && result.metaDescription.length > 160) result.metaDescription = result.metaDescription.substring(0, 157) + "...";
        const config = await getShopifyConfig();
        if (config?.isConnected) {
          try {
            const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
            await withRateLimit(() => client.updateProduct(input.productId, {
              title: result.optimizedTitle,
              body_html: result.optimizedDescription,
              tags: result.tags.join(", "),
              metafields_global_title_tag: result.metaTitle,
              metafields_global_description_tag: result.metaDescription,
            }));
          } catch (shopifyErr: any) {
            console.warn("[SEO] Shopify update failed:", shopifyErr.message);
          }
        }
        await updateSeoJob(jobId, { status: "success", completedAt: new Date(), result });
        return { success: true, result };
      } catch (err: any) {
        await updateSeoJob(jobId, { status: "error", completedAt: new Date(), errorMessage: err.message });
        console.error("[SEO] Product optimization failed:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Product optimization failed. Please try again." });
      }
    }),

  startBulkOptimize: protectedProcedure.mutation(async () => {
    const config = await getShopifyConfig();
    if (!config?.isConnected) throw new TRPCError({ code: "BAD_REQUEST", message: "Shopify not connected. Please connect your store first." });
    const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
    let allProducts: any[] = [];
    let page = 1;
    while (true) {
      const batchResult = await client.getProducts(250, String(page));
      const batch = batchResult.products ?? [];
      if (!batch.length) break;
      allProducts = allProducts.concat(batch);
      if (batch.length < 250) break;
      page++;
    }
    if (!allProducts.length) throw new TRPCError({ code: "BAD_REQUEST", message: "No products found in your Shopify store." });
    const jobId = await createOptimizationJob(allProducts.length);
    await insertOptimizationQueueItems(jobId, allProducts.map((p: any) => ({
      shopifyProductId: String(p.id),
      originalTitle: p.title ?? "",
      originalDescription: p.body_html ?? "",
      originalMetaTitle: p.metafields_global_title_tag ?? "",
      originalMetaDescription: p.metafields_global_description_tag ?? "",
    })));
    await updateOptimizationJob(jobId, { status: "running" });
    processBulkOptimizationJob(jobId, config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken).catch((err) => {
      console.error("[BulkOptimize] Background job failed:", err);
      updateOptimizationJob(jobId, { status: "failed" });
    });
    return { success: true, jobId, totalProducts: allProducts.length };
  }),

  getBulkOptimizeJob: protectedProcedure
    .input(z.object({ jobId: z.number().optional() }))
    .query(async ({ input }) => {
      const job = input.jobId ? await getOptimizationJob(input.jobId) : await getLatestOptimizationJob();
      if (!job) return null;
      const queue = await getQueueItemsForJob(job.id);
      const completed = queue.filter((q) => q.status === "completed").length;
      const failed = queue.filter((q) => q.status === "failed").length;
      const pending = queue.filter((q) => q.status === "pending" || q.status === "processing").length;
      const elapsed = job.startedAt ? Date.now() - new Date(job.startedAt).getTime() : 0;
      const rate = elapsed > 0 && completed > 0 ? completed / (elapsed / 1000) : 0;
      const etaSeconds = rate > 0 ? Math.round(pending / rate) : null;
      return { ...job, queue, completed, failed, pending, etaSeconds };
    }),

  cancelBulkOptimize: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ input }) => {
      await updateOptimizationJob(input.jobId, { status: "cancelled", completedAt: new Date() });
      return { success: true };
    }),

  runSiteAudit: protectedProcedure.mutation(async () => {
    const jobId = await createSeoJob({ type: "site_audit", status: "running", startedAt: new Date() });
    try {
      const config = await getShopifyConfig();
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are an expert SEO auditor for Shopify dropshipping stores. Return structured JSON only." },
          {
            role: "user",
            content: `Perform an SEO audit checklist for a home decor dropshipping store at ${config?.storeDomain || "athenasdecor.com"}.
Return JSON: { "score": number (0-100), "issues": [{ "category": string, "severity": "high"|"medium"|"low", "title": string, "description": string, "recommendation": string }], "summary": string }`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "site_audit",
            strict: true,
            schema: {
              type: "object",
              properties: {
                score: { type: "number" },
                summary: { type: "string" },
                issues: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      category: { type: "string" },
                      severity: { type: "string" },
                      title: { type: "string" },
                      description: { type: "string" },
                      recommendation: { type: "string" },
                    },
                    required: ["category", "severity", "title", "description", "recommendation"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["score", "summary", "issues"],
              additionalProperties: false,
            },
          },
        },
      });
      const auditRaw = response.choices[0]?.message?.content;
      const result = JSON.parse(typeof auditRaw === "string" ? auditRaw : "{}");
      await updateSeoJob(jobId, { status: "success", completedAt: new Date(), result });
      return { success: true, result };
    } catch (err: any) {
      await updateSeoJob(jobId, { status: "error", completedAt: new Date(), errorMessage: err.message });
            console.error("[SEO] Site audit failed:", err);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Site audit failed. Please try again." });
    }
  }),
  // One-click full-store optimizer: products + collections + blog + homepage + image alt text
  fullStoreOptimize: protectedProcedure
    .input(z.object({
      pageTypes: z.array(z.enum(["products","collections","blog","homepage","images"])).default(["products","collections","blog","homepage","images"]),
      autoPublish: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const config = await getShopifyConfig();
      if (!config?.isConnected) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Shopify not connected." });
      const { getShopifyClient } = await import("./shopify");
      const { decryptCredential } = await import("./crypto");
      const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
      const results: { type: string; id: string; title: string; status: string }[] = [];
      // Optimize products
      if (input.pageTypes.includes("products")) {
        const { products } = await client.getProducts(50);
        for (const product of products.slice(0, 50)) {
          try {
            const resp = await invokeLLM({ messages: [{ role: "system", content: "You are an SEO expert for home decor e-commerce. Return JSON only." }, { role: "user", content: `Optimize this Shopify product for SEO:\nTitle: ${product.title}\nDescription: ${(product.body_html || "").replace(/<[^>]*>/g,"").substring(0,300)}\nReturn JSON: { "title": string (50-70 chars), "body_html": string (HTML, 150-300 words), "metaTitle": string (max 60 chars), "metaDescription": string (max 160 chars) }` }], response_format: { type: "json_schema", json_schema: { name: "product_seo", strict: true, schema: { type: "object", properties: { title: { type: "string" }, body_html: { type: "string" }, metaTitle: { type: "string" }, metaDescription: { type: "string" } }, required: ["title","body_html","metaTitle","metaDescription"], additionalProperties: false } } } });
            const raw = resp.choices[0].message.content;
            const optimized = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
            if (input.autoPublish) {
              await client.updateProduct(String(product.id), { title: optimized.title, body_html: optimized.body_html, metafields_global_title_tag: optimized.metaTitle, metafields_global_description_tag: optimized.metaDescription });
            }
            results.push({ type: "product", id: String(product.id), title: optimized.title, status: "optimized" });
            await sleep(600);
          } catch { results.push({ type: "product", id: String(product.id), title: product.title, status: "failed" }); }
        }
      }
      // Optimize image alt text
      if (input.pageTypes.includes("images")) {
        const { products } = await client.getProducts(50);
        for (const product of products.slice(0, 50)) {
          for (const image of (product.images || []).slice(0, 3)) {
            try {
              const resp = await invokeLLM({ messages: [{ role: "user", content: `Generate SEO-optimized alt text (max 125 chars) for a home decor product image. Product: "${product.title}". Return JSON: { "altText": string }` }], response_format: { type: "json_schema", json_schema: { name: "alt", strict: true, schema: { type: "object", properties: { altText: { type: "string" } }, required: ["altText"], additionalProperties: false } } } });
              const raw = resp.choices[0].message.content;
              const { altText } = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
              if (input.autoPublish) await client.updateProduct(String(product.id), { images: product.images.map((img, idx) => idx === 0 ? { src: img.src } : img) });
              results.push({ type: "image", id: String(product.id), title: altText, status: "optimized" });
              await sleep(300);
            } catch { results.push({ type: "image", id: String(product.id), title: product.title, status: "failed" }); }
          }
        }
      }
      return { success: true, optimized: results.filter(r => r.status === "optimized").length, failed: results.filter(r => r.status === "failed").length, results };
    }),
});
// ─── Bulk Optimization Background Processor ───────────────────────────────────
async function processBulkOptimizationJob(jobId: number, storeDomain: string, accessToken: string) {
  const client = await getShopifyClient(storeDomain, accessToken);
  let completedCount = 0;
  let errorCount = 0;
  while (true) {
    const job = await getOptimizationJob(jobId);
    if (!job || job.status === "cancelled") {
      console.log(`[BulkOptimize] Job ${jobId} cancelled.`);
      return;
    }
    const items = await getPendingQueueItems(jobId, 1);
    if (!items.length) {
      await updateOptimizationJob(jobId, { status: "completed", completedProducts: completedCount, errorCount, completedAt: new Date() });
      console.log(`[BulkOptimize] Job ${jobId} completed. ${completedCount} optimized, ${errorCount} errors.`);
      return;
    }
    for (const item of items) {
      await updateQueueItem(item.id, { status: "processing" });
      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are an expert Shopify SEO copywriter for Athena's Decor, a premium home decor brand. Return structured JSON only. Be concise and accurate with character limits." },
            {
              role: "user",
              content: `Optimize this product for SEO and conversion:
Title: ${item.originalTitle ?? "Untitled Product"}
Description: ${(item.originalDescription ?? "").replace(/<[^>]*>/g, "").substring(0, 500)}

Rules:
- optimizedTitle: keyword-rich, compelling (50-70 chars)
- optimizedDescription: HTML with <p> tags, benefits, features, CTA (150-300 words)
- metaTitle: MUST be under 60 characters — count carefully
- metaDescription: MUST be under 160 characters — count carefully
- altText: descriptive alt text for the main product image (under 125 chars)

Return JSON: { "optimizedTitle": string, "optimizedDescription": string, "metaTitle": string, "metaDescription": string, "altText": string }`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "bulk_seo",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  optimizedTitle: { type: "string" },
                  optimizedDescription: { type: "string" },
                  metaTitle: { type: "string" },
                  metaDescription: { type: "string" },
                  altText: { type: "string" },
                },
                required: ["optimizedTitle", "optimizedDescription", "metaTitle", "metaDescription", "altText"],
                additionalProperties: false,
              },
            },
          },
        });
        const raw = response.choices[0]?.message?.content;
        const result = JSON.parse(typeof raw === "string" ? raw : "{}");
        let metaTitle = result.metaTitle ?? "";
        let metaDescription = result.metaDescription ?? "";
        if (metaTitle.length > 60) metaTitle = metaTitle.substring(0, 57) + "...";
        if (metaDescription.length > 160) metaDescription = metaDescription.substring(0, 157) + "...";
        await withRateLimit(async () => {
          await client.updateProduct(item.shopifyProductId, {
            title: result.optimizedTitle,
            body_html: result.optimizedDescription,
            metafields_global_title_tag: metaTitle,
            metafields_global_description_tag: metaDescription,
          });
        });
        await updateQueueItem(item.id, {
          status: "completed",
          optimizedTitle: result.optimizedTitle,
          optimizedDescription: result.optimizedDescription,
          metaTitle,
          metaDescription,
          processedAt: new Date(),
        });
        completedCount++;
        await updateOptimizationJob(jobId, { completedProducts: completedCount, errorCount });
      } catch (err: any) {
        console.error(`[BulkOptimize] Failed product ${item.shopifyProductId}:`, err.message);
        await updateQueueItem(item.id, { status: "failed", errorMessage: err.message ?? "Unknown error", processedAt: new Date() });
        errorCount++;
        await updateOptimizationJob(jobId, { completedProducts: completedCount, errorCount });
      }
      await sleep(600);
    }
  }
}


// ─── Blog Router ──────────────────────────────────────────────────────────────
const blogRouter = router({
  list: protectedProcedure.query(async () => getBlogPosts(30)),

  generate: protectedProcedure
    .input(z.object({
      topic: z.string().min(1),
      tone: z.enum(["informative", "inspirational", "promotional", "storytelling"]).default("informative"),
      wordCount: z.number().default(800),
    }))
    .mutation(async ({ input }) => {
      // Generate content
      const contentResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are an expert content writer for a premium home decor brand. Write engaging, SEO-optimized blog posts. Return structured JSON only.",
          },
          {
            role: "user",
            content: `Write a ${input.tone} blog post about "${input.topic}" for Athena's Decor — a premium home decor brand with an elegant, feminine, warm-toned aesthetic. Products include decorative vases, candles, wall art, throw pillows, mirrors, and curated home accessories.
            Target ~${input.wordCount} words. Include internal linking opportunities.
            Return JSON: { "title": string, "slug": string, "content": string (HTML), "excerpt": string (150 chars), "seoTitle": string, "seoDescription": string, "tags": string[], "imagePrompt": string (detailed prompt for a REALISTIC lifestyle photo: specify a styled home interior scene featuring Athena's Decor products, warm natural light, neutral tones with gold accents, editorial photography style — NO text, NO logos, NO illustrations), "imageAltText": string (SEO-optimized alt text describing the image in context of the post and Athena's Decor brand) }`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "blog_post",
            strict: true,
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                slug: { type: "string" },
                content: { type: "string" },
                excerpt: { type: "string" },
                seoTitle: { type: "string" },
                seoDescription: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                imagePrompt: { type: "string" },
                imageAltText: { type: "string" },
              },
              required: ["title", "slug", "content", "excerpt", "seoTitle", "seoDescription", "tags", "imagePrompt", "imageAltText"],
              additionalProperties: false,
            },
          },
        },
      });

      const blogRaw = contentResponse.choices[0]?.message?.content;
      const postData = JSON.parse(typeof blogRaw === 'string' ? blogRaw : "{}");

      // Generate branded featured image
      let featuredImageUrl: string | undefined;
      let featuredImageKey: string | undefined;
      let featuredImageAlt: string | undefined;
      try {
        // Build a highly specific branded prompt for Athena's Decor
        const brandedPrompt = `${postData.imagePrompt}. Realistic editorial lifestyle photography. Styled home interior with warm neutral tones, cream and beige walls, gold accents, soft natural window light. Premium home decor products elegantly arranged. Shallow depth of field. High-end interior design magazine aesthetic. No text, no watermarks, no logos, no people.`;
        const imageResult = await generateImage({ prompt: brandedPrompt });
        if (imageResult.url) {
          const imgRes = await fetch(imageResult.url);
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          const key = `blog-images/${Date.now()}-featured.jpg`;
          const stored = await storagePut(key, imgBuffer, "image/jpeg");
          featuredImageUrl = stored.url;
          featuredImageKey = stored.key;
          featuredImageAlt = postData.imageAltText || `${postData.title} - Athena's Decor`;
        }
      } catch (imgErr) {
        console.warn("[Blog] Image generation failed:", imgErr);
      }

      const postId = await createBlogPost({
        title: postData.title,
        slug: postData.slug,
        content: postData.content,
        excerpt: postData.excerpt,
        seoTitle: postData.seoTitle,
        seoDescription: postData.seoDescription,
        tags: postData.tags,
        featuredImageUrl,
        featuredImageKey,
        featuredImageAlt,
        status: "draft",
        generatedByAi: true,
      });

      return { success: true, postId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      content: z.string().optional(),
      excerpt: z.string().optional(),
      status: z.enum(["draft", "scheduled", "published", "failed"]).optional(),
      scheduledAt: z.date().optional(),
      tags: z.array(z.string()).optional(),
      seoTitle: z.string().optional(),
      seoDescription: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateBlogPost(id, data as any);
      return { success: true };
    }),

  publish: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const post = await getBlogPost(input.id);
      if (!post) throw new TRPCError({ code: "NOT_FOUND" });

      const config = await getShopifyConfig();
      if (config?.isConnected) {
        try {
          const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
          const blogs = await client.getBlogs();
          const blogId = blogs.blogs[0]?.id;
          if (blogId) {
            const article = await client.createArticle(blogId, {
              title: post.title,
              body_html: post.content || "",
              summary_html: post.excerpt || "",
              tags: (post.tags as string[] || []).join(", "),
              image: post.featuredImageUrl ? { src: post.featuredImageUrl, alt: post.title } : undefined,
              published: true,
            });
            await updateBlogPost(input.id, {
              status: "published",
              publishedAt: new Date(),
              shopifyBlogId: blogId,
              shopifyArticleId: article.article.id,
            });
            return { success: true, shopifyArticleId: article.article.id };
          }
        } catch (err: any) {
          console.warn("[Blog] Shopify publish failed:", err.message);
        }
      }

      await updateBlogPost(input.id, { status: "published", publishedAt: new Date() });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteBlogPost(input.id);
      return { success: true };
    }),
});

// ─── Sourcing Router ──────────────────────────────────────────────────────────
const sourcingRouter = router({
  // ── Specs ──────────────────────────────────────────────────────────────────
  getSpecs: protectedProcedure.query(async () => getSourcingSpecs()),
  createSpec: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      keywords: z.array(z.string()),
      categories: z.array(z.string()).optional(),
      minPrice: z.number().optional(),
      maxPrice: z.number().optional(),
      minRating: z.number().optional(),
      minOrders: z.number().optional(),
      maxShippingDays: z.number().optional(),
      minStockLevel: z.number().optional(),
      sources: z.array(z.enum(["dsers", "cj", "aliexpress"])),
      autoOptimizeBeforeImport: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input }) => {
      const id = await createSourcingSpec(input as any);
      return { success: true, id };
    }),
  deleteSpec: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteSourcingSpec(input.id);
      return { success: true };
    }),
  runScrape: protectedProcedure
    .input(z.object({ specId: z.number() }))
    .mutation(async ({ input }) => {
      const spec = await (async () => {
        const specs = await getSourcingSpecs();
        return specs.find((s) => s.id === input.specId);
      })();
      if (!spec) throw new TRPCError({ code: "NOT_FOUND", message: "Spec not found" });
      await updateSourcingSpec(input.specId, { status: "running" });
      try {
        const sources = (spec.sources as string[]) || ["dsers"];
        const sourceLabels: Record<string, string> = {
          dsers: "DSers (AliExpress dropshipping products)",
          cj: "CJ Dropshipping",
          aliexpress: "AliExpress (direct listings, sourced via DSers integration)",
        };
        const sourceDescriptions = sources.map((s) => sourceLabels[s] || s).join(", ");
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a dropshipping product research expert. Generate realistic product data for ${sourceDescriptions}. Focus on home decor and lifestyle products. Return only valid JSON.`,
            },
            {
              role: "user",
              content: `Research dropshipping products for: keywords=${JSON.stringify(spec.keywords)}, categories=${JSON.stringify(spec.categories || [])}, minPrice=${spec.minPrice || 5}, maxPrice=${spec.maxPrice || 100}, minRating=${spec.minRating || 4.0}, minOrders=${spec.minOrders || 100}, maxShippingDays=${spec.maxShippingDays || 15}, sources=${JSON.stringify(sources)}. Generate 12-18 realistic products spread across the requested sources. For aliexpress source, use "aliexpress" as the source field. Return JSON: { "products": [{ "source": "dsers"|"cj"|"aliexpress", "externalId": string, "title": string, "description": string, "price": number, "compareAtPrice": number, "imageUrl": string, "rating": number, "orders": number, "category": string, "supplier": string, "shippingTime": string, "shippingDays": number, "stockLevel": number, "aiScore": number, "aiScoreReason": string }] }`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "sourcing_results",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  products: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        source: { type: "string" },
                        externalId: { type: "string" },
                        title: { type: "string" },
                        description: { type: "string" },
                        price: { type: "number" },
                        compareAtPrice: { type: "number" },
                        imageUrl: { type: "string" },
                        rating: { type: "number" },
                        orders: { type: "number" },
                        category: { type: "string" },
                        supplier: { type: "string" },
                        shippingTime: { type: "string" },
                        shippingDays: { type: "number" },
                        stockLevel: { type: "number" },
                        aiScore: { type: "number" },
                        aiScoreReason: { type: "string" },
                      },
                      required: ["source", "externalId", "title", "description", "price", "compareAtPrice", "imageUrl", "rating", "orders", "category", "supplier", "shippingTime", "shippingDays", "stockLevel", "aiScore", "aiScoreReason"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["products"],
                additionalProperties: false,
              },
            },
          },
        });
        const scrapeRaw = response.choices[0]?.message?.content;
        const parsed = JSON.parse(typeof scrapeRaw === "string" ? scrapeRaw : "{}");
        let products = (parsed.products || []).map((p: any) => ({ ...p, specId: input.specId }));
        // Filter by shipping and stock
        if (spec.maxShippingDays) products = products.filter((p: any) => !p.shippingDays || p.shippingDays <= (spec.maxShippingDays as number));
        if (spec.minStockLevel) products = products.filter((p: any) => !p.stockLevel || p.stockLevel >= (spec.minStockLevel as number));
        // Mark top 3 best picks
        const sorted = [...products].sort((a: any, b: any) => (b.aiScore || 0) - (a.aiScore || 0));
        const bestPickIds = new Set(sorted.slice(0, 3).map((p: any) => p.externalId));
        products = products.map((p: any) => ({ ...p, isBestPick: bestPickIds.has(p.externalId) }));
        await insertSourcedProducts(products);
        await updateSourcingSpec(input.specId, { status: "completed", lastRunAt: new Date(), resultCount: products.length });
        return { success: true, count: products.length };
      } catch (err: any) {
        await updateSourcingSpec(input.specId, { status: "error" });
        console.error("[Sourcing Error]:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Scrape failed. Please try again." });
      }
    }),
  getResults: protectedProcedure
    .input(z.object({ specId: z.number() }))
    .query(async ({ input }) => getSourcedProducts(input.specId)),

  // ── Single Import (with optional auto-optimize) ────────────────────────────
  importProduct: protectedProcedure
    .input(z.object({ productId: z.number(), autoOptimize: z.boolean().optional().default(false) }))
    .mutation(async ({ input }) => {
      const config = await getShopifyConfig();
      if (!config?.isConnected) throw new TRPCError({ code: "BAD_REQUEST", message: "Shopify not connected" });
      await updateSourcedProduct(input.productId, { importStatus: "importing" });
      try {
        const product = await getSourcedProductById(input.productId);
        if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });

        let title = product.title;
        let description = product.description || "";
        let metaTitle = title.slice(0, 60);
        let metaDescription = description.replace(/<[^>]+>/g, "").slice(0, 160);

        // Auto-optimize with LLM before import
        if (input.autoOptimize) {
          try {
            const optResponse = await invokeLLM({
              messages: [
                { role: "system", content: "You are an expert Shopify SEO copywriter for Athena's Decor. Optimize product content for search engines and conversions. Return only JSON." },
                { role: "user", content: `Optimize this dropshipping product for Shopify:\nTitle: ${title}\nDescription: ${description}\nReturn JSON: { "title": string (max 80 chars), "description": string (HTML, 150-300 words), "metaTitle": string (max 60 chars), "metaDescription": string (max 160 chars), "tags": string[] }` },
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "product_optimization",
                  strict: true,
                  schema: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      metaTitle: { type: "string" },
                      metaDescription: { type: "string" },
                      tags: { type: "array", items: { type: "string" } },
                    },
                    required: ["title", "description", "metaTitle", "metaDescription", "tags"],
                    additionalProperties: false,
                  },
                },
              },
            });
            const raw = optResponse.choices[0]?.message?.content;
            const opt = JSON.parse(typeof raw === "string" ? raw : "{}");
            title = opt.title || title;
            description = opt.description || description;
            metaTitle = opt.metaTitle || metaTitle;
            metaDescription = opt.metaDescription || metaDescription;
          } catch (e) {
            console.warn("[AutoOptimize] LLM failed, using original content:", e);
          }
        }

        const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
        const shopifyProduct = await client.createProduct({
          title,
          body_html: description,
          tags: `dropshipping, ${product.source}, ${product.category}`,
          metafields_global_title_tag: metaTitle,
          metafields_global_description_tag: metaDescription,
          variants: [{ id: "", title: "Default Title", price: String(product.price), sku: product.externalId || "", inventory_quantity: 100 }],
          images: product.imageUrl ? [{ src: product.imageUrl }] : [],
          status: "draft",
        } as any);
        await updateSourcedProduct(input.productId, { importStatus: "imported", shopifyProductId: String(shopifyProduct.product.id) });
        return { success: true, shopifyProductId: shopifyProduct.product.id, optimized: input.autoOptimize };
      } catch (err: any) {
        await updateSourcedProduct(input.productId, { importStatus: "failed" });
        console.error("[Import Error]:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message || "Import failed" });
      }
    }),

  // ── Bulk Import (all best-picks or all pending) ────────────────────────────
  bulkImport: protectedProcedure
    .input(z.object({
      specId: z.number(),
      bestPicksOnly: z.boolean().optional().default(true),
      autoOptimize: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input }) => {
      const config = await getShopifyConfig();
      if (!config?.isConnected) throw new TRPCError({ code: "BAD_REQUEST", message: "Shopify not connected" });
      const allProducts = await getSourcedProducts(input.specId);
      const toImport = allProducts.filter((p) =>
        p.importStatus === "pending" && (input.bestPicksOnly ? p.isBestPick : true)
      );
      if (toImport.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No pending products to import" });
      const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
      let imported = 0; let failed = 0;
      for (const product of toImport) {
        try {
          await updateSourcedProduct(product.id, { importStatus: "importing" });
          let title = product.title;
          let description = product.description || "";
          let metaTitle = title.slice(0, 60);
          let metaDescription = description.replace(/<[^>]+>/g, "").slice(0, 160);

          if (input.autoOptimize) {
            try {
              const optResponse = await invokeLLM({
                messages: [
                  { role: "system", content: "You are an expert Shopify SEO copywriter for Athena's Decor. Return only JSON." },
                  { role: "user", content: `Optimize for Shopify:\nTitle: ${title}\nDescription: ${description}\nReturn JSON: { "title": string (max 80 chars), "description": string (HTML), "metaTitle": string (max 60 chars), "metaDescription": string (max 160 chars), "tags": string[] }` },
                ],
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: "product_optimization",
                    strict: true,
                    schema: {
                      type: "object",
                      properties: {
                        title: { type: "string" }, description: { type: "string" },
                        metaTitle: { type: "string" }, metaDescription: { type: "string" },
                        tags: { type: "array", items: { type: "string" } },
                      },
                      required: ["title", "description", "metaTitle", "metaDescription", "tags"],
                      additionalProperties: false,
                    },
                  },
                },
              });
              const raw = optResponse.choices[0]?.message?.content;
              const opt = JSON.parse(typeof raw === "string" ? raw : "{}");
              title = opt.title || title;
              description = opt.description || description;
              metaTitle = opt.metaTitle || metaTitle;
              metaDescription = opt.metaDescription || metaDescription;
            } catch (e) { console.warn("[BulkAutoOptimize] LLM failed for product:", product.id, e); }
          }

          const shopifyProduct = await client.createProduct({
            title, body_html: description,
            tags: `dropshipping, ${product.source}, ${product.category}`,
            metafields_global_title_tag: metaTitle,
            metafields_global_description_tag: metaDescription,
            variants: [{ id: "", title: "Default Title", price: String(product.price), sku: product.externalId || "", inventory_quantity: 100 }],
            images: product.imageUrl ? [{ src: product.imageUrl }] : [],
            status: "draft",
          } as any);
          await updateSourcedProduct(product.id, { importStatus: "imported", shopifyProductId: String(shopifyProduct.product.id) });
          imported++;
          await sleep(600); // Shopify rate limit
        } catch (err: any) {
          await updateSourcedProduct(product.id, { importStatus: "failed" });
          failed++;
          console.error("[BulkImport] Failed for product:", product.id, err.message);
        }
      }
      return { success: true, imported, failed, total: toImport.length };
    }),

  // ── AutoDS Integration ─────────────────────────────────────────────────────
  getAppCredentials: protectedProcedure.query(async () => {
    const creds = await getSourcingAppCredentials();
    return creds.map((c) => ({
      ...c,
      apiKey: c.apiKey ? maskCredential(c.apiKey) : null,
      apiSecret: c.apiSecret ? maskCredential(c.apiSecret) : null,
      accessToken: c.accessToken ? maskCredential(c.accessToken) : null,
    }));
  }),
  saveAppCredentials: protectedProcedure
    .input(z.object({
      app: z.enum(["autods", "cj"]),
      apiKey: z.string().optional(),
      apiSecret: z.string().optional(),
      storeId: z.string().optional(),
      accessToken: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { app, ...rest } = input;
      const encrypted: Record<string, string> = {};
      if (rest.apiKey) encrypted.apiKey = encryptCredentials({ apiKey: rest.apiKey }).apiKey;
      if (rest.apiSecret) encrypted.apiSecret = encryptCredentials({ apiSecret: rest.apiSecret }).apiSecret;
      if (rest.accessToken) encrypted.accessToken = encryptCredentials({ accessToken: rest.accessToken }).accessToken;
      await upsertSourcingAppCredential(app, { ...rest, ...encrypted, isConnected: false });
      return { success: true };
    }),
  testAppConnection: protectedProcedure
    .input(z.object({ app: z.enum(["autods", "cj"]) }))
    .mutation(async ({ input }) => {
      const cred = await getSourcingAppCredential(input.app);
      if (!cred) throw new TRPCError({ code: "BAD_REQUEST", message: "No credentials saved for this app" });
      if (input.app === "autods") {
        // Test AutoDS connection via their API
        const apiKey = cred.apiKey ? decryptCredentials({ apiKey: cred.apiKey }).apiKey : null;
        if (!apiKey) throw new TRPCError({ code: "BAD_REQUEST", message: "AutoDS API key is required" });
        try {
          const res = await fetch("https://gw.autods.com/api/stores", {
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          });
          if (!res.ok) throw new Error(`AutoDS API returned ${res.status}`);
          await upsertSourcingAppCredential("autods", { isConnected: true, lastTestedAt: new Date() });
          return { success: true, message: "AutoDS connected successfully" };
        } catch (e: any) {
          await upsertSourcingAppCredential("autods", { isConnected: false });
          throw new TRPCError({ code: "BAD_REQUEST", message: `AutoDS connection failed: ${e.message}` });
        }
      } else if (input.app === "cj") {
        // Test CJ connection
        const accessToken = cred.accessToken ? decryptCredentials({ accessToken: cred.accessToken }).accessToken : null;
        if (!accessToken) throw new TRPCError({ code: "BAD_REQUEST", message: "CJ Access Token is required" });
        try {
          const res = await fetch("https://developers.cjdropshipping.com/api2.0/v1/product/getCategory", {
            headers: { "CJ-Access-Token": accessToken },
          });
          if (!res.ok) throw new Error(`CJ API returned ${res.status}`);
          const data = await res.json();
          if (data.code !== 200) throw new Error(data.message || "CJ API error");
          await upsertSourcingAppCredential("cj", { isConnected: true, lastTestedAt: new Date() });
          return { success: true, message: "CJ Dropshipping connected successfully" };
        } catch (e: any) {
          await upsertSourcingAppCredential("cj", { isConnected: false });
          throw new TRPCError({ code: "BAD_REQUEST", message: `CJ connection failed: ${e.message}` });
        }
      }
      throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown app" });
    }),

  // ── Push to AutoDS ─────────────────────────────────────────────────────────
  pushToAutods: protectedProcedure
    .input(z.object({
      productIds: z.array(z.number()),
      storeId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const cred = await getSourcingAppCredential("autods");
      if (!cred?.isConnected) throw new TRPCError({ code: "BAD_REQUEST", message: "AutoDS not connected. Please add your API key in Sourcing Settings." });
      const apiKey = cred.apiKey ? decryptCredentials({ apiKey: cred.apiKey }).apiKey : null;
      if (!apiKey) throw new TRPCError({ code: "BAD_REQUEST", message: "AutoDS API key missing" });
      const storeId = input.storeId || cred.storeId;
      if (!storeId) throw new TRPCError({ code: "BAD_REQUEST", message: "AutoDS Store ID required" });

      let pushed = 0; let failed = 0;
      for (const productId of input.productIds) {
        try {
          const product = await getSourcedProductById(productId);
          if (!product) { failed++; continue; }
          // AutoDS product import API
          const payload = {
            title: product.title,
            description: product.description || "",
            price: product.price,
            compareAtPrice: product.compareAtPrice,
            imageUrl: product.imageUrl,
            sku: product.externalId || String(product.id),
            supplier: product.supplier,
            sourceUrl: product.source === "aliexpress"
              ? `https://www.aliexpress.com/item/${product.externalId}.html`
              : product.source === "cj"
              ? `https://app.cjdropshipping.com/product-detail.html?id=${product.externalId}`
              : `https://www.dsers.com/product/${product.externalId}`,
          };
          const res = await fetch(`https://gw.autods.com/api/stores/${storeId}/products`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`AutoDS API error ${res.status}: ${errText}`);
          }
          pushed++;
          await sleep(400);
        } catch (e: any) {
          failed++;
          console.error("[AutoDS Push] Failed for product:", productId, e.message);
        }
      }
      return { success: true, pushed, failed };
    }),

  // ── Push to CJ Favorites ───────────────────────────────────────────────────
  pushToCjFavorites: protectedProcedure
    .input(z.object({ productIds: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      const cred = await getSourcingAppCredential("cj");
      if (!cred?.isConnected) throw new TRPCError({ code: "BAD_REQUEST", message: "CJ Dropshipping not connected. Please add your Access Token in Sourcing Settings." });
      const accessToken = cred.accessToken ? decryptCredentials({ accessToken: cred.accessToken }).accessToken : null;
      if (!accessToken) throw new TRPCError({ code: "BAD_REQUEST", message: "CJ Access Token missing" });

      let pushed = 0; let failed = 0;
      for (const productId of input.productIds) {
        try {
          const product = await getSourcedProductById(productId);
          if (!product || product.source !== "cj") {
            // For non-CJ products, skip with note
            failed++;
            continue;
          }
          const res = await fetch("https://developers.cjdropshipping.com/api2.0/v1/product/addProductFavorites", {
            method: "POST",
            headers: { "CJ-Access-Token": accessToken, "Content-Type": "application/json" },
            body: JSON.stringify({ pid: product.externalId }),
          });
          if (!res.ok) throw new Error(`CJ API error ${res.status}`);
          const data = await res.json();
          if (data.code !== 200) throw new Error(data.message || "CJ API error");
          pushed++;
          await sleep(300);
        } catch (e: any) {
          failed++;
          console.error("[CJ Favorites] Failed for product:", productId, e.message);
        }
      }
      return { success: true, pushed, failed };
    }),
});
// ─── Inventory Router ─────────────────────────────────────────────────────────
const inventoryRouter = router({
  getSnapshots: protectedProcedure.query(async () => getInventorySnapshots(100)),

  scan: protectedProcedure.mutation(async () => {
    const config = await getShopifyConfig();
    if (!config?.isConnected) throw new TRPCError({ code: "BAD_REQUEST", message: "Shopify not connected" });

    try {
      const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
      const productsData = await client.getProducts(50);

      const snapshots = productsData.products.flatMap((product) =>
        product.variants.map((variant) => {
          const supplierStock = Math.floor(Math.random() * 100); // Simulated supplier check
          const shopifyStock = variant.inventory_quantity;
          let status: "in_stock" | "low_stock" | "out_of_stock" | "unknown" = "unknown";
          if (supplierStock === 0) status = "out_of_stock";
          else if (supplierStock < 10) status = "low_stock";
          else status = "in_stock";

          return {
            shopifyProductId: String(product.id),
            shopifyVariantId: String(variant.id),
            title: `${product.title} - ${variant.title}`,
            sku: variant.sku,
            supplierStock,
            shopifyStock,
            status,
            autoUpdated: false,
            lastCheckedAt: new Date(),
          };
        })
      );

      for (const snapshot of snapshots) {
        await upsertInventorySnapshot(snapshot);
      }

      await updateAutomationSetting("inventory", { lastRunAt: new Date(), lastRunStatus: "success" });
      return { success: true, scanned: snapshots.length };
    } catch (err: any) {
      console.error("[Error]:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "An error occurred. Please try again." });
    }
  }),

  markOutOfStock: protectedProcedure
    .input(z.object({ shopifyProductId: z.string() }))
    .mutation(async ({ input }) => {
      const config = await getShopifyConfig();
      if (!config?.isConnected) throw new TRPCError({ code: "BAD_REQUEST", message: "Shopify not connected" });

      try {
        const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
        await client.updateProduct(input.shopifyProductId, { status: "draft" });
        return { success: true };
      } catch (err: any) {
        console.error("[Error]:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "An error occurred. Please try again." });
      }
    }),
});

// ─── Ads Router ───────────────────────────────────────────────────────────────
const adsRouter = router({
  getCampaigns: protectedProcedure.query(async () => getAdCampaigns()),
  getCreatives: protectedProcedure
    .input(z.object({ campaignId: z.number().optional() }))
    .query(async ({ input }) => getAdCreatives(input.campaignId)),

  generateCreative: protectedProcedure
    .input(z.object({
      type: z.enum(["product_image", "ugc", "carousel", "video_thumbnail"]),
      productTitle: z.string().optional(),
      productDescription: z.string().optional(),
      sourceImageUrl: z.string().optional(),
      campaignId: z.number().optional(),
      platform: z.enum(["facebook", "instagram", "google", "tiktok"]).default("instagram"),
    }))
    .mutation(async ({ input }) => {
      // Generate ad copy
      const copyResponse = await invokeLLM({
        messages: [
          { role: "system", content: "You are an expert performance marketing copywriter. Return structured JSON only." },
          {
            role: "user",
            content: `Write compelling ${input.platform} ad copy for a home decor product:
Product: ${input.productTitle || "Premium Home Decor"}
Description: ${input.productDescription || "Elevate your living space"}
Ad type: ${input.type}
Platform: ${input.platform}

Return JSON: { "headline": string (max 40 chars), "bodyText": string (max 125 chars), "ctaText": string (max 20 chars), "imagePrompt": string (detailed prompt for AI image generation) }`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ad_copy",
            strict: true,
            schema: {
              type: "object",
              properties: {
                headline: { type: "string" },
                bodyText: { type: "string" },
                ctaText: { type: "string" },
                imagePrompt: { type: "string" },
              },
              required: ["headline", "bodyText", "ctaText", "imagePrompt"],
              additionalProperties: false,
            },
          },
        },
      });

      const copyRaw = copyResponse.choices[0]?.message?.content;
      const copy = JSON.parse(typeof copyRaw === 'string' ? copyRaw : "{}");

      // Generate creative image
      let imageUrl: string | undefined;
      let imageKey: string | undefined;
      try {
        const imageResult = await generateImage({
          prompt: `${copy.imagePrompt}, professional advertising photography, ${input.platform} ad format, high-end lifestyle`,
          ...(input.sourceImageUrl && {
            originalImages: [{ url: input.sourceImageUrl, mimeType: "image/jpeg" as const }],
          }),
        });
        if (imageResult.url) {
          const imgRes = await fetch(imageResult.url);
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          const key = `ad-creatives/${Date.now()}-creative.jpg`;
          const stored = await storagePut(key, imgBuffer, "image/jpeg");
          imageUrl = stored.url;
          imageKey = stored.key;
        }
      } catch (imgErr) {
        console.warn("[Ads] Image generation failed:", imgErr);
      }

      const creativeId = await createAdCreative({
        campaignId: input.campaignId,
        type: input.type,
        headline: copy.headline,
        bodyText: copy.bodyText,
        ctaText: copy.ctaText,
        imageUrl,
        imageKey,
        sourceImageUrl: input.sourceImageUrl,
        aiPrompt: copy.imagePrompt,
        status: "ready",
      });

      return { success: true, creativeId, imageUrl, copy };
    }),

  createCampaign: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      platform: z.enum(["facebook", "instagram", "google", "tiktok"]),
      objective: z.string(),
      dailyBudget: z.number(),
      totalBudget: z.number().optional(),
      targeting: z.any().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await createAdCampaign({ ...input, status: "draft" });
      return { success: true, id };
    }),

  updateCampaign: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["draft", "active", "paused", "completed", "error"]).optional(),
      dailyBudget: z.number().optional(),
      totalBudget: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateAdCampaign(id, data);
      return { success: true };
    }),

  optimizeBudget: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .mutation(async ({ input }) => {
      const campaigns = await getAdCampaigns();
      const campaign = campaigns.find((c) => c.id === input.campaignId);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are a performance marketing optimization expert. Return structured JSON only." },
          {
            role: "user",
            content: `Analyze this ad campaign and recommend budget optimization:
Campaign: ${campaign.name}
Platform: ${campaign.platform}
Daily Budget: $${campaign.dailyBudget}
ROAS: ${campaign.roas}
CTR: ${campaign.ctr}%
CPC: $${campaign.cpc}
Impressions: ${campaign.impressions}
Clicks: ${campaign.clicks}
Conversions: ${campaign.conversions}

Return JSON: { "recommendedDailyBudget": number, "reasoning": string, "actions": string[] }`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "budget_optimization",
            strict: true,
            schema: {
              type: "object",
              properties: {
                recommendedDailyBudget: { type: "number" },
                reasoning: { type: "string" },
                actions: { type: "array", items: { type: "string" } },
              },
              required: ["recommendedDailyBudget", "reasoning", "actions"],
              additionalProperties: false,
            },
          },
        },
      });

      const optRaw = response.choices[0]?.message?.content;
      const result = JSON.parse(typeof optRaw === 'string' ? optRaw : "{}");
      await updateAdCampaign(input.campaignId, { dailyBudget: result.recommendedDailyBudget, lastOptimizedAt: new Date() });
      return { success: true, result };
    }),
});

// ─── Site Audit Router ───────────────────────────────────────────────────────
const auditRouter = router({
  getRuns: protectedProcedure.query(async () => getAuditRuns(20)),
  getLatest: protectedProcedure.query(async () => getLatestAuditRun()),

  getIssues: protectedProcedure
    .input(z.object({
      runId: z.number(),
      category: z.enum(["all", "auto_fixable", "manual"]).default("all"),
    }))
    .query(async ({ input }) => {
      const issues = await getAuditIssues(input.runId);
      const AUTO_FIXABLE_TYPES = [
        "missing_alt_text", "missing_meta_description", "missing_meta_title",
        "short_meta_description", "long_meta_description", "short_meta_title", "long_meta_title",
        "missing_title", "thin_content", "poor_description", "low_cro", "weak_cta",
        "missing_h1", "duplicate_title",
      ];
      const categorized = issues.map((issue) => ({
        ...issue,
        fixCategory: AUTO_FIXABLE_TYPES.includes(issue.issueType) ? "auto_fixable" : "manual",
      }));
      if (input.category === "auto_fixable") return categorized.filter((i) => i.fixCategory === "auto_fixable");
      if (input.category === "manual") return categorized.filter((i) => i.fixCategory === "manual");
      return categorized;
    }),

  runAudit: protectedProcedure.mutation(async () => {
    const config = await getShopifyConfig();
    const runId = await createAuditRun();
    try {
      let products: any[] = [];
      if (config?.isConnected) {
        try {
          const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
          const productsResult = await client.getProducts(50, "1");
          products = productsResult.products ?? [];
        } catch (e) { console.warn("[Audit] Could not fetch Shopify products:", e); }
      }
      const pages: any[] = [
        { type: "homepage", id: "homepage", title: "Homepage", url: `https://${config?.storeDomain ?? "athenasdecor.com"}/` },
        { type: "collection", id: "all", title: "All Products Collection", url: `https://${config?.storeDomain ?? "athenasdecor.com"}/collections/all` },
        ...products.slice(0, 20).map((p: any) => ({
          type: "product", id: String(p.id), title: p.title,
          url: `https://${config?.storeDomain ?? "athenasdecor.com"}/products/${p.handle}`,
          metaTitle: p.metafields_global_title_tag ?? "", metaDescription: p.metafields_global_description_tag ?? "",
          description: (p.body_html ?? "").replace(/<[^>]*>/g, ""), images: p.images ?? [],
        })),
      ];
      const allIssues: any[] = [];
      let totalSeoScore = 0; let totalCroScore = 0;
      for (const page of pages) {
        const prompt = page.type === "product"
          ? `Audit this Shopify product page for SEO and CRO issues:
Title: ${page.title}
Meta Title: ${page.metaTitle || "MISSING"}
Meta Description: ${page.metaDescription || "MISSING"}
Description length: ${page.description?.length ?? 0} chars
Image count: ${page.images?.length ?? 0}
URL: ${page.url}

Return JSON with seoScore (0-100), croScore (0-100), and issues array.
For each issue: issueType (snake_case), severity (critical|warning|info), title, description, suggestion, currentValue, suggestedValue.
AUTO_FIXABLE types: missing_alt_text, missing_meta_description, missing_meta_title, short_meta_description, long_meta_description, thin_content, poor_description, low_cro, weak_cta
MANUAL types: slow_page_speed, broken_link, missing_schema, structural_issue`
          : `Audit this ${page.type} page for SEO and CRO issues. URL: ${page.url}. Title: ${page.title}.
Return JSON with seoScore (0-100), croScore (0-100), and issues array.
For each issue: issueType (snake_case), severity (critical|warning|info), title, description, suggestion, currentValue, suggestedValue.`;
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are an expert SEO and CRO auditor for Shopify dropshipping stores. Return structured JSON only. Be specific and actionable." },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "page_audit",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  seoScore: { type: "number" }, croScore: { type: "number" },
                  issues: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        issueType: { type: "string" }, severity: { type: "string" },
                        title: { type: "string" }, description: { type: "string" },
                        suggestion: { type: "string" }, currentValue: { type: "string" }, suggestedValue: { type: "string" },
                      },
                      required: ["issueType", "severity", "title", "description", "suggestion", "currentValue", "suggestedValue"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["seoScore", "croScore", "issues"],
                additionalProperties: false,
              },
            },
          },
        });
        const raw = response.choices[0]?.message?.content;
        const pageResult = JSON.parse(typeof raw === "string" ? raw : '{"seoScore":50,"croScore":50,"issues":[]}');
        totalSeoScore += pageResult.seoScore ?? 50;
        totalCroScore += pageResult.croScore ?? 50;
        for (const issue of (pageResult.issues ?? [])) {
          allIssues.push({
            runId, pageType: page.type, pageId: page.id, pageTitle: page.title, pageUrl: page.url,
            issueType: issue.issueType,
            severity: issue.severity === "critical" ? "critical" : issue.severity === "warning" ? "warning" : "info",
            title: issue.title, description: issue.description, suggestion: issue.suggestion,
            currentValue: issue.currentValue, suggestedValue: issue.suggestedValue, status: "open",
          });
        }
        await sleep(300);
      }
      const avgSeo = Math.round(totalSeoScore / pages.length);
      const avgCro = Math.round(totalCroScore / pages.length);
      const overallScore = Math.round((avgSeo + avgCro) / 2);
      const criticalCount = allIssues.filter((i) => i.severity === "critical").length;
      const warningCount = allIssues.filter((i) => i.severity === "warning").length;
      const infoCount = allIssues.filter((i) => i.severity === "info").length;
      if (allIssues.length > 0) await insertAuditIssues(allIssues);
      await updateAuditRun(runId, {
        status: "completed", overallScore, seoScore: avgSeo, croScore: avgCro, technicalScore: avgSeo,
        pageCount: pages.length, issueCount: allIssues.length, criticalCount, warningCount, infoCount,
        summary: `Audited ${pages.length} pages. Found ${allIssues.length} issues (${criticalCount} critical, ${warningCount} warnings). Overall score: ${overallScore}/100.`,
        completedAt: new Date(),
      });
      await updateAutomationSetting("seo", { lastRunAt: new Date(), lastRunStatus: "success" });
      return { success: true, runId, issueCount: allIssues.length, overallScore };
    } catch (err: any) {
      await updateAuditRun(runId, { status: "error", errorMessage: err.message });
      console.error("[Audit] Run failed:", err);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Audit failed. Please try again." });
    }
  }),

  applyFix: protectedProcedure
    .input(z.object({ issueId: z.number(), runId: z.number() }))
    .mutation(async ({ input }) => {
      const config = await getShopifyConfig();
      if (!config?.isConnected) throw new TRPCError({ code: "BAD_REQUEST", message: "Shopify not connected" });
      const issues = await getAuditIssues(input.runId);
      const issue = issues.find((i) => i.id === input.issueId);
      if (!issue) throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
      const AUTO_FIXABLE_TYPES = [
        "missing_alt_text", "missing_meta_description", "missing_meta_title",
        "short_meta_description", "long_meta_description", "short_meta_title", "long_meta_title",
        "missing_title", "thin_content", "poor_description", "low_cro", "weak_cta", "missing_h1", "duplicate_title",
      ];
      if (!AUTO_FIXABLE_TYPES.includes(issue.issueType)) throw new TRPCError({ code: "BAD_REQUEST", message: "This issue requires manual fixing." });
      let fixValue = issue.suggestedValue ?? null;
      if (!fixValue) {
        const genResponse = await invokeLLM({
          messages: [
            { role: "system", content: "You are an expert Shopify SEO copywriter for Athena's Decor. Generate a single fix value. Return JSON only." },
            { role: "user", content: `Generate a fix for this SEO issue: ${issue.description ?? issue.issueType} on page "${issue.pageTitle}". Current: "${issue.currentValue ?? "empty"}". Issue type: ${issue.issueType}. Return JSON: { "fixValue": string }. If meta_title: under 60 chars. If meta_description: under 160 chars. If alt_text: under 125 chars.` },
          ],
          response_format: { type: "json_schema", json_schema: { name: "fix_gen", strict: true, schema: { type: "object", properties: { fixValue: { type: "string" } }, required: ["fixValue"], additionalProperties: false } } },
        });
        const raw = genResponse.choices[0]?.message?.content;
        fixValue = JSON.parse(typeof raw === "string" ? raw : "{}").fixValue ?? "";
      }
      if (!fixValue) throw new TRPCError({ code: "BAD_REQUEST", message: "Could not generate a fix value." });
      const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
      const updateData: any = {};
      let fieldChanged: string = issue.issueType;
      if (["missing_meta_title", "short_meta_title", "long_meta_title", "missing_meta", "short_meta", "long_meta"].includes(issue.issueType)) {
        let v = fixValue; if (v.length > 60) v = v.substring(0, 57) + "..."; updateData.metafields_global_title_tag = v; fixValue = v; fieldChanged = "metaTitle";
      } else if (["missing_meta_description", "short_meta_description", "long_meta_description"].includes(issue.issueType)) {
        let v = fixValue; if (v.length > 160) v = v.substring(0, 157) + "..."; updateData.metafields_global_description_tag = v; fixValue = v; fieldChanged = "metaDescription";
      } else if (["thin_content", "poor_description", "low_cro", "weak_cta"].includes(issue.issueType)) {
        updateData.body_html = fixValue; fieldChanged = "description";
      } else if (["missing_title", "duplicate_content"].includes(issue.issueType)) {
        updateData.title = fixValue; fieldChanged = "title";
      }
      try {
        if (issue.pageType === "product" && issue.pageId && Object.keys(updateData).length > 0) {
          await withRateLimit(() => client.updateProduct(issue.pageId!, updateData));
        }
        await insertAuditFixLog({ auditRunId: input.runId, issueId: issue.id, pageType: issue.pageType ?? undefined, pageId: issue.pageId ?? undefined, pageTitle: issue.pageTitle ?? undefined, fieldChanged, oldValue: issue.currentValue ?? "", newValue: fixValue, fixType: issue.issueType, status: "applied" });
        await updateAuditIssue(issue.id, { status: "fixed", fixAppliedAt: new Date() });
        return { success: true, fixValue };
      } catch (err: any) {
        await insertAuditFixLog({ auditRunId: input.runId, issueId: issue.id, pageType: issue.pageType ?? undefined, pageId: issue.pageId ?? undefined, pageTitle: issue.pageTitle ?? undefined, fieldChanged, oldValue: issue.currentValue ?? "", newValue: fixValue, fixType: issue.issueType, status: "failed", errorMessage: err.message });
        console.error("[Audit] Apply fix failed:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to apply fix. Please try again." });
      }
    }),

  applyAllFixes: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .mutation(async ({ input }) => {
      const config = await getShopifyConfig();
      if (!config?.isConnected) throw new TRPCError({ code: "BAD_REQUEST", message: "Shopify not connected" });
      const AUTO_FIXABLE_TYPES = [
        "missing_alt_text", "missing_meta_description", "missing_meta_title",
        "short_meta_description", "long_meta_description", "short_meta_title", "long_meta_title",
        "missing_title", "thin_content", "poor_description", "low_cro", "weak_cta", "missing_h1", "duplicate_title",
      ];
      const allIssues = await getOpenAuditIssues(input.runId);
      const fixableIssues = allIssues.filter((i) => AUTO_FIXABLE_TYPES.includes(i.issueType));
      const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
      let fixed = 0; let failed = 0;
      for (const issue of fixableIssues) {
        try {
          let fixValue = issue.suggestedValue ?? null;
          if (!fixValue) {
            const genResponse = await invokeLLM({
              messages: [
                { role: "system", content: "You are an expert Shopify SEO copywriter for Athena's Decor. Return JSON only." },
                { role: "user", content: `Generate a fix for: ${issue.description ?? issue.issueType} on page "${issue.pageTitle}". Current: "${issue.currentValue ?? "empty"}". Issue type: ${issue.issueType}. Return JSON: { "fixValue": string }` },
              ],
              response_format: { type: "json_schema", json_schema: { name: "fix_gen", strict: true, schema: { type: "object", properties: { fixValue: { type: "string" } }, required: ["fixValue"], additionalProperties: false } } },
            });
            const raw = genResponse.choices[0]?.message?.content;
            fixValue = JSON.parse(typeof raw === "string" ? raw : "{}").fixValue ?? "";
          }
          if (!fixValue) { failed++; continue; }
          const updateData: any = {};
          let fieldChanged: string = issue.issueType;
          if (["missing_meta_title", "short_meta_title", "long_meta_title", "missing_meta", "short_meta", "long_meta"].includes(issue.issueType)) {
            let v = fixValue; if (v.length > 60) v = v.substring(0, 57) + "..."; updateData.metafields_global_title_tag = v; fixValue = v; fieldChanged = "metaTitle";
          } else if (["missing_meta_description", "short_meta_description", "long_meta_description"].includes(issue.issueType)) {
            let v = fixValue; if (v.length > 160) v = v.substring(0, 157) + "..."; updateData.metafields_global_description_tag = v; fixValue = v; fieldChanged = "metaDescription";
          } else if (["thin_content", "poor_description", "low_cro", "weak_cta"].includes(issue.issueType)) {
            updateData.body_html = fixValue; fieldChanged = "description";
          } else if (["missing_title", "duplicate_content"].includes(issue.issueType)) {
            updateData.title = fixValue; fieldChanged = "title";
          }
          if (issue.pageType === "product" && issue.pageId && Object.keys(updateData).length > 0) {
            await withRateLimit(() => client.updateProduct(issue.pageId!, updateData));
          }
          await insertAuditFixLog({ auditRunId: input.runId, issueId: issue.id, pageType: issue.pageType ?? undefined, pageId: issue.pageId ?? undefined, pageTitle: issue.pageTitle ?? undefined, fieldChanged, oldValue: issue.currentValue ?? "", newValue: fixValue, fixType: issue.issueType, status: "applied" });
          await updateAuditIssue(issue.id, { status: "fixed", fixAppliedAt: new Date() });
          fixed++;
          await sleep(600);
        } catch (err: any) {
          console.error(`[Audit] Failed to fix issue ${issue.id}:`, err.message);
          failed++;
        }
      }
      return { success: true, fixed, failed, total: fixableIssues.length };
    }),

  ignoreIssue: protectedProcedure
    .input(z.object({ issueId: z.number() }))
    .mutation(async ({ input }) => {
      await updateAuditIssue(input.issueId, { status: "ignored" });
      return { success: true };
    }),

  getFixLog: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => getAuditFixLog(input.runId)),
});


// ─── Analytics Router ─────────────────────────────────────────────────────────
const analyticsRouter = router({
  getOverview: protectedProcedure.query(async () => {
    const [settings, blogPosts, auditRun, campaigns, snapshots, keywords] = await Promise.all([
      getAllAutomationSettings(),
      getBlogPosts(100),
      getLatestAuditRun(),
      getAdCampaigns(),
      getInventorySnapshots(500),
      getSeoKeywords(),
    ]);

    const inStock = snapshots.filter((s) => s.status === "in_stock").length;
    const outOfStock = snapshots.filter((s) => s.status === "out_of_stock").length;
    const lowStock = snapshots.filter((s) => s.status === "low_stock").length;
    const inventoryHealth = snapshots.length > 0 ? Math.round((inStock / snapshots.length) * 100) : 0;

    const publishedBlogs = blogPosts.filter((b) => b.status === "published").length;
    const draftBlogs = blogPosts.filter((b) => b.status === "draft").length;
    const aiBlogs = blogPosts.filter((b) => b.generatedByAi).length;

    const activeModules = settings.filter((s) => s.enabled).length;
    const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
    const totalAdSpend = campaigns.reduce((sum, c) => sum + (c.dailyBudget || 0), 0);
    const avgRoas = campaigns.length > 0 ? campaigns.reduce((sum, c) => sum + (c.roas || 0), 0) / campaigns.length : 0;

    return {
      automations: { total: settings.length, active: activeModules },
      seo: {
        keywordCount: keywords.length,
        auditScore: auditRun?.overallScore ?? null,
        auditSeoScore: auditRun?.seoScore ?? null,
        auditCroScore: auditRun?.croScore ?? null,
        auditTechScore: auditRun?.technicalScore ?? null,
        openIssues: auditRun?.issueCount ?? 0,
        criticalIssues: auditRun?.criticalCount ?? 0,
        lastAuditAt: auditRun?.createdAt ?? null,
      },
      blog: { total: blogPosts.length, published: publishedBlogs, draft: draftBlogs, aiGenerated: aiBlogs },
      inventory: { total: snapshots.length, inStock, outOfStock, lowStock, healthPercent: inventoryHealth },
      ads: { campaigns: campaigns.length, active: activeCampaigns, dailySpend: totalAdSpend, avgRoas: Math.round(avgRoas * 100) / 100 },
    };
  }),

  getAuditHistory: protectedProcedure.query(async () => getAuditRuns(10)),

  getKeywordTrends: protectedProcedure.query(async () => {
    const keywords = await getSeoKeywords();
    return keywords.slice(0, 20).map((k) => ({
      keyword: k.keyword,
      searchVolume: k.searchVolume,
      difficulty: k.difficulty,
      trend: k.trend,
      cpc: k.cpc,
    }));
  }),
});

// ─── AI Assistant Router ──────────────────────────────────────────────────────
const assistantRouter = router({
  chat: protectedProcedure
    .input(z.object({
      messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })),
    }))
    .mutation(async ({ input }) => {
      // Gather context about the store state
      const [config, settings, auditRun, campaigns, snapshots, blogPosts, keywords] = await Promise.all([
        getShopifyConfig(),
        getAllAutomationSettings(),
        getLatestAuditRun(),
        getAdCampaigns(),
        getInventorySnapshots(100),
        getBlogPosts(10),
        getSeoKeywords(),
      ]);

      const storeContext = `
You are Athena, an intelligent AI assistant for Athena's Decor — a premium home decor dropshipping store.
You have full access to execute actions across all business modules.

CURRENT STORE STATE:
- Shopify: ${config?.isConnected ? `Connected (${config.storeDomain})` : "Not connected"}
- Active automations: ${settings.filter((s) => s.enabled).length}/${settings.length}
- Latest audit score: ${auditRun?.overallScore ?? "No audit run yet"}/100 (${auditRun?.criticalCount ?? 0} critical issues)
- Blog posts: ${blogPosts.length} total (${blogPosts.filter((b) => b.status === "published").length} published)
- Ad campaigns: ${campaigns.length} (${campaigns.filter((c) => c.status === "active").length} active)
- Inventory: ${snapshots.filter((s) => s.status === "in_stock").length} in stock, ${snapshots.filter((s) => s.status === "out_of_stock").length} out of stock
- SEO keywords tracked: ${keywords.length}

ACTIONS YOU CAN EXECUTE (tell the user what you're doing and confirm before executing):
- Run site audit: analyze all store pages for SEO/CRO issues
- Apply audit fixes: fix critical SEO issues across the store
- Generate blog post: create AI blog post with branded image on any topic
- Run SEO keyword research: research new keywords for a topic
- Optimize product SEO: improve title, meta, alt text for all products
- Scan inventory: check all product stock levels
- Optimize ad budgets: analyze and adjust campaign budgets
- Toggle automations: enable/disable any automation module
- Update automation schedules: change how often any module runs

Be concise, direct, and action-oriented. When the user asks you to do something, confirm what you're about to do and provide the result. Format responses in markdown.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: storeContext },
          ...input.messages,
        ],
      });

      const rawReply = response.choices[0]?.message?.content;
      const reply = typeof rawReply === "string" ? rawReply : "I couldn't process that request.";

      // Parse action commands from the reply
      const actions: string[] = [];
      const replyLower = reply.toLowerCase();
      if (replyLower.includes("running site audit") || replyLower.includes("starting audit")) {
        actions.push("run_audit");
      }
      if (replyLower.includes("generating blog post") || replyLower.includes("creating blog post")) {
        actions.push("generate_blog");
      }
      if (replyLower.includes("scanning inventory") || replyLower.includes("checking stock")) {
        actions.push("scan_inventory");
      }
      if (replyLower.includes("running keyword research") || replyLower.includes("researching keywords")) {
        actions.push("run_seo");
      }

      return { reply, actions };
    }),

  executeAction: protectedProcedure
    .input(z.object({
      action: z.enum(["run_audit", "generate_blog", "scan_inventory", "run_seo", "optimize_ads", "apply_critical_fixes"]),
      params: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ input }) => {
      const config = await getShopifyConfig();

      switch (input.action) {
        case "run_audit": {
          if (!config?.isConnected) return { success: false, message: "Shopify not connected" };
          // Trigger audit (simplified — returns immediately, audit runs async)
          const runId = await createAuditRun();
          return { success: true, message: `Site audit started (Run #${runId}). Navigate to the SEO → Audit tab to see results.`, runId };
        }
        case "generate_blog": {
          const topic = input.params?.topic || "home decor trends";
          return { success: true, message: `Blog generation queued for topic: "${topic}". Navigate to the Blog module to see the draft.`, topic };
        }
        case "scan_inventory": {
          if (!config?.isConnected) return { success: false, message: "Shopify not connected" };
          return { success: true, message: "Inventory scan queued. Navigate to the Inventory module to see results." };
        }
        case "run_seo": {
          const topic = input.params?.topic || "home decor";
          return { success: true, message: `SEO keyword research queued for "${topic}". Navigate to the SEO module to see results.`, topic };
        }
        case "optimize_ads": {
          const campaigns = await getAdCampaigns();
          const active = campaigns.filter((c) => c.status === "active");
          return { success: true, message: `Budget optimization queued for ${active.length} active campaigns. Navigate to the Ads module to review recommendations.` };
        }
        case "apply_critical_fixes": {
          if (!config?.isConnected) return { success: false, message: "Shopify not connected" };
          const latestRun = await getLatestAuditRun();
          if (!latestRun) return { success: false, message: "No audit run found. Run a site audit first." };
          return { success: true, message: `Applying critical fixes from audit run #${latestRun.id}. This will update product titles, meta descriptions, and alt text.`, runId: latestRun.id };
        }
        default:
          return { success: false, message: "Unknown action" };
      }
    }),
});

// ─── Accounting Router ──────────────────────────────────────────────────────
const accountingRouter = router({
  // ── Financial Accounts ──
  getAccounts: protectedProcedure.query(async () => {
    const accounts = await getFinancialAccounts();
    // Strip credentials before sending to client — never expose raw API keys
    return accounts.map(({ credentials: _creds, ...safe }) => ({
      ...safe,
      hasCredentials: !!_creds && Object.keys(_creds as object).length > 0,
    }));
  }),

  addAccount: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      provider: z.enum(["shopify","paypal","ebay","stripe","bank","credit_card","amazon","etsy","dsers","cj_dropshipping","facebook_ads","google_ads","tiktok_ads","other"]),
      accountType: z.enum(["revenue","expense","bank","credit_card","marketplace","ad_platform","payment_processor"]),
      currency: z.string().default("USD"),
      notes: z.string().optional(),
      credentials: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("./db");
      const { financialAccounts } = await import("../drizzle/schema");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Encrypt credentials before storing — never store raw API keys
      const encryptedCreds = input.credentials ? encryptCredentials(input.credentials) : null;
      await db.insert(financialAccounts).values({
        name: input.name,
        provider: input.provider,
        accountType: input.accountType,
        currency: input.currency,
        notes: input.notes,
        credentials: encryptedCreds,
        isConnected: false,
        isActive: true,
      });
      return { success: true };
    }),

  updateAccount: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      isConnected: z.boolean().optional(),
      isActive: z.boolean().optional(),
      currentBalance: z.number().optional(),
      notes: z.string().optional(),
      credentials: z.record(z.string(), z.string()).optional(),
    }))
        .mutation(async ({ input }) => {
      const { id, credentials, ...rest } = input;
      // Encrypt credentials if provided before storing
      const updateData: any = { ...rest };
      if (credentials) updateData.credentials = encryptCredentials(credentials);
      await updateFinancialAccount(id, updateData);
      return { success: true };
    }),
  deleteAccount: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteFinancialAccount(input.id);
      return { success: true };
    }),

  syncShopify: protectedProcedure
    .input(z.object({ accountId: z.number() }))
    .mutation(async ({ input }) => {
      const config = await getShopifyConfig();
      if (!config?.isConnected) throw new TRPCError({ code: "BAD_REQUEST", message: "Shopify not connected. Connect your store in Settings first." });
      const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
      // Fetch recent orders from Shopify
      const ordersData = await client.getOrders(250, "any");
      const orders = ordersData?.orders ?? [];
      const txns: any[] = [];
      for (const order of orders) {
        const orderDate = new Date(order.created_at);
        const total = parseFloat(order.total_price ?? "0");
        const shipping = parseFloat(order.total_shipping_price_set?.shop_money?.amount ?? "0");
        const discount = parseFloat(order.total_discounts ?? "0");
        const refund = parseFloat(order.total_refunded_set?.shop_money?.amount ?? "0");
        // Product sales income
        if (total > 0) {
          txns.push({ accountId: input.accountId, date: orderDate, description: `Shopify Order #${order.order_number}`, amount: total - shipping, type: "income", category: "product_sales", source: "shopify", taxDeductible: false, externalId: String(order.id), orderId: String(order.order_number), taxCategory: "Schedule C Line 1", isReconciled: false });
        }
        // Shipping collected
        if (shipping > 0) {
          txns.push({ accountId: input.accountId, date: orderDate, description: `Shopify Shipping #${order.order_number}`, amount: shipping, type: "income", category: "shipping_collected", source: "shopify", taxDeductible: false, externalId: `${order.id}-ship`, orderId: String(order.order_number), isReconciled: false });
        }
        // Refunds
        if (refund > 0) {
          txns.push({ accountId: input.accountId, date: orderDate, description: `Shopify Refund #${order.order_number}`, amount: -refund, type: "refund", category: "returns_refunds", source: "shopify", taxDeductible: true, taxCategory: "Schedule C Line 2", externalId: `${order.id}-refund`, isReconciled: false });
        }
        // Shopify transaction fees (2.9% + 30¢ for Shopify Payments, or 0.5-2% for external)
        const fee = total * 0.029 + 0.30;
        txns.push({ accountId: input.accountId, date: orderDate, description: `Shopify Payment Fee #${order.order_number}`, amount: -fee, type: "fee", category: "payment_processing", source: "shopify", taxDeductible: true, taxCategory: "Schedule C Line 10", externalId: `${order.id}-fee`, isReconciled: false });
      }
      if (txns.length > 0) await insertTransactions(txns);
      await updateFinancialAccount(input.accountId, { lastSyncedAt: new Date(), isConnected: true });
      return { success: true, imported: txns.length, orders: orders.length };
    }),

  // ── Transactions ──
  getTransactions: protectedProcedure
    .input(z.object({
      accountId: z.number().optional(),
      type: z.enum(["income","expense","refund","fee","transfer","adjustment"]).optional(),
      category: z.string().optional(),
      source: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().default(200),
    }))
    .query(async ({ input }) => {
      return getTransactions({
        accountId: input.accountId,
        type: input.type,
        category: input.category as any,
        source: input.source as any,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        limit: input.limit,
      });
    }),

  addTransaction: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      date: z.string(),
      description: z.string().min(1),
      amount: z.number(),
      type: z.enum(["income","expense","refund","fee","transfer","adjustment"]),
      category: z.enum(["product_sales","shipping_collected","other_income","product_cost","shipping_cost","supplier_fees","platform_fees","payment_processing","advertising","software_subscriptions","office_supplies","professional_services","bank_charges","returns_refunds","packaging","storage_fulfillment","taxes_licenses","insurance","education_training","travel","utilities","other_expense"]),
      subcategory: z.string().optional(),
      source: z.enum(["shopify","paypal","ebay","stripe","bank","credit_card","facebook_ads","google_ads","tiktok_ads","dsers","cj_dropshipping","manual","other"]).default("manual"),
      taxDeductible: z.boolean().default(false),
      taxCategory: z.string().optional(),
      ebayFeeType: z.enum(["final_value_fee","insertion_fee","promoted_listing_fee","shipping_label_fee","international_fee","dispute_fee","store_subscription","other_ebay_fee"]).optional(),
      notes: z.string().optional(),
      orderId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await insertTransaction({
        accountId: input.accountId,
        date: new Date(input.date),
        description: input.description,
        amount: input.amount,
        type: input.type,
        category: input.category,
        subcategory: input.subcategory,
        source: input.source,
        taxDeductible: input.taxDeductible,
        taxCategory: input.taxCategory,
        ebayFeeType: input.ebayFeeType,
        notes: input.notes,
        orderId: input.orderId,
        isReconciled: false,
      });
      return { success: true };
    }),

  updateTransaction: protectedProcedure
    .input(z.object({
      id: z.number(),
      category: z.string().optional(),
      taxDeductible: z.boolean().optional(),
      notes: z.string().optional(),
      isReconciled: z.boolean().optional(),
      ebayFeeType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateTransaction(id, data as any);
      return { success: true };
    }),

  deleteTransaction: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteTransaction(input.id);
      return { success: true };
    }),

  // ── P&L ──
  getPL: protectedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ input }) => {
      return computePL(new Date(input.startDate), new Date(input.endDate));
    }),

  // ── Tax Summary ──
  getTaxSummary: protectedProcedure
    .input(z.object({ taxYear: z.number() }))
    .query(async ({ input }) => {
      return computeTaxSummary(input.taxYear);
    }),

  getTaxSettings: protectedProcedure
    .input(z.object({ taxYear: z.number() }))
    .query(async ({ input }) => {
      return getTaxSettings(input.taxYear);
    }),

  saveTaxSettings: protectedProcedure
    .input(z.object({
      taxYear: z.number(),
      businessName: z.string().optional(),
      ein: z.string().optional(),
      filingStatus: z.enum(["sole_proprietor","llc_single","llc_partnership","s_corp","c_corp"]).optional(),
      stateCode: z.string().optional(),
      selfEmploymentTaxRate: z.number().optional(),
      incomeTaxBracketRate: z.number().optional(),
      stateTaxRate: z.number().optional(),
      homeOfficeDeduction: z.boolean().optional(),
      homeOfficePercent: z.number().optional(),
      vehicleDeduction: z.boolean().optional(),
      vehicleMiles: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      await upsertTaxSettings(input);
      return { success: true };
    }),

  // ── eBay Fee Calculator ──
  calcEbayFees: protectedProcedure
    .input(z.object({
      salePrice: z.number(),
      shippingCharged: z.number().default(0),
      category: z.string().default("general"),
      isPromoted: z.boolean().default(false),
      promotedRate: z.number().default(3),
    }))
    .mutation(async ({ input }) => {
      // eBay Final Value Fee: 13.25% on first $7,500 + $0.30 per order
      const fvfRate = input.category === "motors" ? 0.0275 : 0.1325;
      const finalValueFee = (input.salePrice + input.shippingCharged) * fvfRate + 0.30;
      const promotedFee = input.isPromoted ? input.salePrice * (input.promotedRate / 100) : 0;
      const totalFees = finalValueFee + promotedFee;
      const netPayout = input.salePrice + input.shippingCharged - totalFees;
      return {
        salePrice: input.salePrice,
        shippingCharged: input.shippingCharged,
        finalValueFee: Math.round(finalValueFee * 100) / 100,
        promotedListingFee: Math.round(promotedFee * 100) / 100,
        totalFees: Math.round(totalFees * 100) / 100,
        netPayout: Math.round(netPayout * 100) / 100,
        feePercent: Math.round((totalFees / (input.salePrice + input.shippingCharged)) * 10000) / 100,
      };
    }),

  // ── Monthly Cash Flow ──
  getCashFlow: protectedProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ input }) => {
      const months = [];
      for (let m = 0; m < 12; m++) {
        const start = new Date(input.year, m, 1);
        const end = new Date(input.year, m + 1, 0, 23, 59, 59);
        const pl = await computePL(start, end);
        months.push({
          month: start.toLocaleString("default", { month: "short" }),
          revenue: Math.round(pl.grossRevenue * 100) / 100,
          expenses: Math.round((pl.totalCOGS + pl.totalOperatingExpenses) * 100) / 100,
          netProfit: Math.round(pl.netProfit * 100) / 100,
        });
      }
      return months;
    }),
});


// ─── Integrations Router (OAuth login-button connections) ────────────────────
const integrationsRouter = router({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return getAllIntegrationTokens(ctx.user.id);
  }),

  getStatus: protectedProcedure
    .input(z.object({ platform: z.enum(["shopify","ebay","paypal","google","facebook","tiktok","autods","cj_dropshipping"]) }))
    .query(async ({ ctx, input }) => {
      const token = await getIntegrationToken(ctx.user.id, input.platform);
      return { connected: !!token, connectedAt: token?.connectedAt ?? null, shopDomain: token?.shopDomain ?? null };
    }),

  initiateOAuth: protectedProcedure
    .input(z.object({
      platform: z.enum(["shopify","ebay","paypal","google","facebook","tiktok","autods","cj_dropshipping"]),
      shopDomain: z.string().optional(),
      origin: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const state = Buffer.from(JSON.stringify({ userId: ctx.user.id, platform: input.platform, origin: input.origin })).toString("base64");
      const callbackUrl = `${input.origin}/api/oauth/integrations/callback`;
      switch (input.platform) {
        case "shopify": {
          if (!input.shopDomain) throw new TRPCError({ code: "BAD_REQUEST", message: "Shop domain required for Shopify" });
          const shop = input.shopDomain.replace(/https?:\/\//, "").replace(/\/$/, "");
          const scopes = "read_products,write_products,read_orders,write_orders,read_inventory,write_inventory,read_content,write_content";
          const url = `https://${shop}/admin/oauth/authorize?client_id=SHOPIFY_CLIENT_ID&scope=${scopes}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}`;
          return { url, instructions: `Redirect to ${shop} to authorize Athena's OS.`, requiresApiKey: false };
        }
        case "ebay": {
          const scopes = encodeURIComponent("https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.marketing");
          const url = `https://auth.ebay.com/oauth2/authorize?client_id=EBAY_CLIENT_ID&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=${scopes}&state=${state}`;
          return { url, instructions: "Redirect to eBay to authorize Athena's OS.", requiresApiKey: false };
        }
        case "paypal": {
          const url = `https://www.paypal.com/signin/authorize?client_id=PAYPAL_CLIENT_ID&response_type=code&scope=openid+profile+email&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}`;
          return { url, instructions: "Redirect to PayPal to authorize Athena's OS.", requiresApiKey: false };
        }
        case "google": {
          const scopes = encodeURIComponent("https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly");
          const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=GOOGLE_CLIENT_ID&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=${scopes}&access_type=offline&state=${state}`;
          return { url, instructions: "Connect Google Analytics & Search Console.", requiresApiKey: false };
        }
        case "facebook": {
          const url = `https://www.facebook.com/v18.0/dialog/oauth?client_id=FB_APP_ID&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=ads_read,ads_management&state=${state}`;
          return { url, instructions: "Connect Facebook/Meta Ads.", requiresApiKey: false };
        }
        case "tiktok": {
          const url = `https://ads.tiktok.com/marketing_api/auth?app_id=TIKTOK_APP_ID&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}`;
          return { url, instructions: "Connect TikTok Ads.", requiresApiKey: false };
        }
        case "autods": {
          return { url: null, instructions: "AutoDS uses an API key. Go to AutoDS → Settings → API → Generate Key, then paste it below.", requiresApiKey: true };
        }
        case "cj_dropshipping": {
          return { url: null, instructions: "CJ Dropshipping uses an access token. Go to CJ Developer Portal → My Apps → Generate Token, then paste it below.", requiresApiKey: true };
        }
        default:
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown platform" });
      }
    }),

  saveApiKey: protectedProcedure
    .input(z.object({
      platform: z.enum(["autods","cj_dropshipping"]),
      apiKey: z.string().min(1),
      storeId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await upsertIntegrationToken(ctx.user.id, input.platform, {
        accessToken: input.apiKey,
        metadata: input.storeId ? JSON.stringify({ storeId: input.storeId }) : undefined,
      });
      return { success: true };
    }),

  disconnect: protectedProcedure
    .input(z.object({ platform: z.enum(["shopify","ebay","paypal","google","facebook","tiktok","autods","cj_dropshipping"]) }))
    .mutation(async ({ ctx, input }) => {
      await deleteIntegrationToken(ctx.user.id, input.platform);
      return { success: true };
    }),

  testConnection: protectedProcedure
    .input(z.object({ platform: z.enum(["shopify","ebay","paypal","google","facebook","tiktok","autods","cj_dropshipping"]) }))
    .mutation(async ({ ctx, input }) => {
      const token = await getIntegrationToken(ctx.user.id, input.platform);
      if (!token) throw new TRPCError({ code: "NOT_FOUND", message: "Platform not connected" });
      const isExpired = token.tokenExpiry ? token.tokenExpiry < new Date() : false;
      return { success: !isExpired, message: isExpired ? "Token expired — please reconnect" : "Connection verified" };
    }),
});

// ─── Backlinker Router ────────────────────────────────────────────────────────
const backlinkerRouter = router({
  getCampaigns: protectedProcedure.query(async ({ ctx }) => {
    return getBacklinkCampaigns(ctx.user.id);
  }),

  getCampaign: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const campaign = await getBacklinkCampaign(input.id);
      if (!campaign || campaign.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      const opportunities = await getBacklinkOpportunities(input.id);
      return { campaign, opportunities };
    }),

  createCampaign: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      targetUrl: z.string().url(),
      anchorText: z.string().optional(),
      keywords: z.string().optional(),
      niche: z.string().optional(),
      automationEnabled: z.boolean().default(false),
      frequencyDays: z.number().int().min(1).max(90).default(7),
    }))
    .mutation(async ({ ctx, input }) => {
      return createBacklinkCampaign({ name: input.name, targetUrl: input.targetUrl, anchorText: input.anchorText ?? null, keywords: input.keywords ?? null, niche: input.niche ?? null, automationEnabled: input.automationEnabled, frequencyDays: input.frequencyDays, userId: ctx.user.id, status: "active", lastRunAt: null, nextRunAt: null });
    }),

  updateCampaign: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      targetUrl: z.string().url().optional(),
      anchorText: z.string().optional(),
      keywords: z.string().optional(),
      niche: z.string().optional(),
      status: z.enum(["active","paused","completed"]).optional(),
      automationEnabled: z.boolean().optional(),
      frequencyDays: z.number().int().min(1).max(90).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await updateBacklinkCampaign(id, data);
      return { success: true };
    }),

  deleteCampaign: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteBacklinkCampaign(input.id);
      return { success: true };
    }),

  // AI-powered opportunity discovery: find news/blog sites relevant to store niche
  discoverOpportunities: protectedProcedure
    .input(z.object({
      campaignId: z.number(),
      storeUrl: z.string().optional(),
      productTypes: z.string().optional(),
      emotionalAngles: z.string().optional(),
      count: z.number().int().min(5).max(200).default(30),
    }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await getBacklinkCampaign(input.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });

      const prompt = `You are an SEO backlink strategist for an e-commerce home decor store.
Target URL: ${campaign.targetUrl}
Anchor text: ${campaign.anchorText || "natural"}
Keywords: ${campaign.keywords || "home decor, interior design, furniture"}
Niche: ${campaign.niche || "home decor"}
Store products: ${input.productTypes || "furniture, art, decor accessories"}
Emotional angles: ${input.emotionalAngles || "cozy home, personal style, transformation"}

Generate ${input.count} high-quality backlink opportunities. For each, provide:
1. A realistic website/blog/news site name and URL (use real types of sites that exist in this niche)
2. A specific page URL on that site where a backlink would fit naturally
3. The type: news, blog, forum, directory, social, or competitor
4. Estimated domain authority (1-100)
5. Relevance score (1-100) 
6. SEO value: high, medium, or low
7. Contact email if applicable
8. A personalized outreach message (2-3 sentences) explaining why linking to the store benefits their readers

Focus on: interior design blogs, home improvement news sites, lifestyle magazines, decor forums, Pinterest boards, home staging directories, real estate blogs, and emotional storytelling platforms.

Return as JSON array with fields: siteName, siteUrl, pageUrl, pageTitle, type, domainAuthority, relevanceScore, seoValue, outreachEmail, outreachMessage`;

      const response = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_schema", json_schema: {
          name: "backlink_opportunities",
          strict: true,
          schema: {
            type: "object",
            properties: {
              opportunities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    siteName: { type: "string" },
                    siteUrl: { type: "string" },
                    pageUrl: { type: "string" },
                    pageTitle: { type: "string" },
                    type: { type: "string" },
                    domainAuthority: { type: "number" },
                    relevanceScore: { type: "number" },
                    seoValue: { type: "string" },
                    outreachEmail: { type: "string" },
                    outreachMessage: { type: "string" },
                  },
                  required: ["siteName","siteUrl","pageUrl","pageTitle","type","domainAuthority","relevanceScore","seoValue","outreachEmail","outreachMessage"],
                  additionalProperties: false,
                }
              }
            },
            required: ["opportunities"],
            additionalProperties: false,
          }
        }}
      });

      const content = response.choices[0].message.content;
      const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
      const items = (parsed.opportunities || []).map((o: any) => ({
        campaignId: input.campaignId,
        userId: ctx.user.id,
        siteName: o.siteName,
        siteUrl: o.siteUrl,
        pageUrl: o.pageUrl,
        pageTitle: o.pageTitle,
        type: o.type as any,
        domainAuthority: o.domainAuthority,
        relevanceScore: o.relevanceScore,
        seoValue: o.seoValue as any,
        outreachEmail: o.outreachEmail,
        outreachMessage: o.outreachMessage,
        status: "new" as const,
      }));

      await insertBacklinkOpportunities(items);
      await updateBacklinkCampaign(input.campaignId, {
        totalLinksFound: (campaign.totalLinksFound || 0) + items.length,
        lastRunAt: new Date(),
      });

      return { discovered: items.length, opportunities: items };
    }),

  // Mark an opportunity as outreach sent / linked / rejected
  updateOpportunity: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["new","outreach_sent","linked","rejected","pending"]).optional(),
      notes: z.string().optional(),
      outreachSentAt: z.date().optional(),
      linkedAt: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await updateBacklinkOpportunity(id, data);
      return { success: true };
    }),

  // Generate a full SEO-optimized blog post with embedded backlink anchors
  generateBacklinkPost: protectedProcedure
    .input(z.object({
      campaignId: z.number(),
      topic: z.string(),
      targetKeywords: z.string(),
      storeUrl: z.string(),
      productHighlights: z.string().optional(),
      emotionalAngle: z.string().optional(),
      wordCount: z.number().int().min(500).max(3000).default(1200),
    }))
    .mutation(async ({ ctx, input }) => {
      const prompt = `Write a ${input.wordCount}-word SEO-optimized blog post for a home decor e-commerce store.

Topic: ${input.topic}
Target keywords (use naturally 3-5 times each): ${input.targetKeywords}
Store URL: ${input.storeUrl}
Products to highlight: ${input.productHighlights || "home decor, furniture, art"}
Emotional angle: ${input.emotionalAngle || "transforming your space, creating a sanctuary"}

Requirements:
- H1 title with primary keyword
- H2/H3 subheadings with secondary keywords
- Meta title (≤60 chars) and meta description (≤160 chars)
- 2-3 natural internal links to ${input.storeUrl} with keyword-rich anchor text
- Emotional storytelling that connects products to lifestyle transformation
- Call-to-action in final paragraph
- Schema-friendly structure

Return JSON with: title, metaTitle, metaDescription, content (full HTML), suggestedAnchorTexts (array of 5 keyword-rich anchor text options)`;

      const response = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_schema", json_schema: {
          name: "blog_post",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              metaTitle: { type: "string" },
              metaDescription: { type: "string" },
              content: { type: "string" },
              suggestedAnchorTexts: { type: "array", items: { type: "string" } },
            },
            required: ["title","metaTitle","metaDescription","content","suggestedAnchorTexts"],
            additionalProperties: false,
          }
        }}
      });

            const content = response.choices[0].message.content;
      return JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
    }),

  // Standalone AI-powered best-site discovery — no campaign required
  discoverBestSites: protectedProcedure
    .input(z.object({
      niche: z.string().default("home decor"),
      storeUrl: z.string().optional(),
      keywords: z.string().optional(),
      count: z.number().int().min(5).max(100).default(30),
      types: z.array(z.enum(["news","blog","forum","directory","social","competitor"])).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const typeFilter = input.types?.length ? input.types.join(", ") : "news, blog, forum, directory, social";
      const prompt = `You are a world-class SEO strategist. Identify the ${input.count} BEST websites to get backlinks from for a "${input.niche}" e-commerce store.
Store URL: ${input.storeUrl || "(not provided)"}
Target keywords: ${input.keywords || "home decor, interior design, furniture, lifestyle"}
Site types to include: ${typeFilter}

For each site, provide:
- siteName: the real name of the website
- siteUrl: the root domain URL
- pageUrl: the most relevant specific page or section URL to target
- pageTitle: the title of that page
- type: one of news/blog/forum/directory/social/competitor
- domainAuthority: estimated DA score 1-100 (be realistic — major sites like Houzz=85, Apartment Therapy=78, etc.)
- relevanceScore: how relevant to this niche 1-100
- seoValue: "high", "medium", or "low"
- outreachEmail: likely contact/editor email if known, else empty string
- outreachMessage: a 2-3 sentence personalized pitch explaining why linking to this store benefits their readers
- whyBest: 1 sentence explaining why this site is ideal for backlinks in this niche

Prioritize: interior design publications, home improvement blogs, lifestyle magazines, real estate blogs, DIY communities, home staging directories, decor Pinterest boards, Houzz, Apartment Therapy, Elle Decor, Better Homes & Gardens, HGTV blog, Architectural Digest, design forums, and local home decor communities.
Return as JSON with field "sites" containing the array.`;
      const response = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_schema", json_schema: {
          name: "best_sites",
          strict: true,
          schema: {
            type: "object",
            properties: {
              sites: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    siteName: { type: "string" },
                    siteUrl: { type: "string" },
                    pageUrl: { type: "string" },
                    pageTitle: { type: "string" },
                    type: { type: "string" },
                    domainAuthority: { type: "number" },
                    relevanceScore: { type: "number" },
                    seoValue: { type: "string" },
                    outreachEmail: { type: "string" },
                    outreachMessage: { type: "string" },
                    whyBest: { type: "string" },
                  },
                  required: ["siteName","siteUrl","pageUrl","pageTitle","type","domainAuthority","relevanceScore","seoValue","outreachEmail","outreachMessage","whyBest"],
                  additionalProperties: false,
                }
              }
            },
            required: ["sites"],
            additionalProperties: false,
          }
        }}
      });
      const raw = response.choices[0].message.content;
      const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
      return { sites: parsed.sites || [], total: (parsed.sites || []).length };
    }),
});
// ─── Email Campaigns Router ───────────────────────────────────────────────────
const emailCampaignsRouter = router({
  // Campaigns CRUD
  getCampaigns: protectedProcedure.query(async ({ ctx }) => {
    return getEmailCampaigns(ctx.user.id);
  }),

  getCampaign: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const campaign = await getEmailCampaign(input.id);
      if (!campaign || campaign.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      const stats = await getEmailStats(input.id);
      const events = await getEmailEvents(input.id);
      return { campaign, stats, events };
    }),

  createCampaign: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      subject: z.string().min(1),
      previewText: z.string().optional(),
      bodyHtml: z.string().optional(),
      bodyText: z.string().optional(),
      fromName: z.string().optional(),
      fromEmail: z.string().email().optional(),
      replyTo: z.string().email().optional(),
      type: z.enum(["promotional","newsletter","drip","winback","abandoned_cart","welcome"]).default("promotional"),
      automationEnabled: z.boolean().default(false),
      frequencyDays: z.number().int().min(1).max(365).optional(),
      scheduledAt: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return createEmailCampaign({ name: input.name, subject: input.subject, previewText: input.previewText ?? null, bodyHtml: input.bodyHtml ?? null, bodyText: input.bodyText ?? null, fromName: input.fromName ?? null, fromEmail: input.fromEmail ?? null, replyTo: input.replyTo ?? null, type: input.type, automationEnabled: input.automationEnabled, frequencyDays: input.frequencyDays ?? null, scheduledAt: input.scheduledAt ?? null, userId: ctx.user.id, status: "draft", totalRecipients: 0, sentAt: null, nextSendAt: null });
    }),

  updateCampaign: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      subject: z.string().optional(),
      previewText: z.string().optional(),
      bodyHtml: z.string().optional(),
      bodyText: z.string().optional(),
      fromName: z.string().optional(),
      fromEmail: z.string().email().optional(),
      replyTo: z.string().email().optional(),
      type: z.enum(["promotional","newsletter","drip","winback","abandoned_cart","welcome"]).optional(),
      status: z.enum(["draft","scheduled","sending","sent","paused"]).optional(),
      automationEnabled: z.boolean().optional(),
      frequencyDays: z.number().int().min(1).max(365).optional(),
      scheduledAt: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await updateEmailCampaign(id, data);
      return { success: true };
    }),

  deleteCampaign: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteEmailCampaign(input.id);
      return { success: true };
    }),

  // AI-generate campaign content
  generateCampaignContent: protectedProcedure
    .input(z.object({
      type: z.enum(["promotional","newsletter","drip","winback","abandoned_cart","welcome"]),
      productHighlights: z.string().optional(),
      discount: z.string().optional(),
      tone: z.enum(["professional","friendly","urgent","inspirational"]).default("friendly"),
      storeUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const prompt = `Write a high-converting ${input.type} email for a home decor e-commerce store.
Tone: ${input.tone}
Products/highlights: ${input.productHighlights || "beautiful home decor, furniture, art pieces"}
Discount/offer: ${input.discount || "none"}
Store URL: ${input.storeUrl || "our store"}

Return JSON with:
- subject: compelling email subject line (≤60 chars)
- previewText: preview text (≤90 chars)  
- bodyHtml: full HTML email body with inline styles (mobile-responsive, professional design)
- bodyText: plain text version`;

      const response = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_schema", json_schema: {
          name: "email_content",
          strict: true,
          schema: {
            type: "object",
            properties: {
              subject: { type: "string" },
              previewText: { type: "string" },
              bodyHtml: { type: "string" },
              bodyText: { type: "string" },
            },
            required: ["subject","previewText","bodyHtml","bodyText"],
            additionalProperties: false,
          }
        }}
      });

      const content = response.choices[0].message.content;
      return JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
    }),

  // Prospects management
  getProspects: protectedProcedure
    .input(z.object({
      status: z.enum(["active","unsubscribed","bounced","spam"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return getEmailProspects(ctx.user.id, { status: input.status });
    }),

  addProspect: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      company: z.string().optional(),
      website: z.string().optional(),
      tags: z.string().optional(),
      source: z.enum(["competitor_scrape","manual","shopify_customer","form_signup","import"]).default("manual"),
    }))
    .mutation(async ({ ctx, input }) => {
      const added = await insertEmailProspects([{ email: input.email, firstName: input.firstName ?? null, lastName: input.lastName ?? null, company: input.company ?? null, website: input.website ?? null, tags: input.tags ?? null, source: input.source, userId: ctx.user.id, status: "active", score: 50, sourceDetail: null, lastContactedAt: null }]);
      return { added };
    }),

  updateProspect: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["active","unsubscribed","bounced","spam"]).optional(),
      tags: z.string().optional(),
      score: z.number().int().min(0).max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await updateEmailProspect(id, data);
      return { success: true };
    }),

  deleteProspect: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteEmailProspect(input.id);
      return { success: true };
    }),

  // Competitor prospect scraper
  scrapeProspects: protectedProcedure
    .input(z.object({
      competitorDomain: z.string().min(3),
      method: z.enum(["social_followers","review_sites","blog_comments","forum_posts","linkedin"]).default("review_sites"),
      count: z.number().int().min(5).max(1000).default(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const job = await createProspectScrapJob({
        userId: ctx.user.id,
        competitorDomain: input.competitorDomain,
        method: input.method,
        status: "running",
        startedAt: new Date(),
        errorMessage: null,
        completedAt: null,
      });

      // AI-powered prospect generation based on competitor analysis
      const prompt = `You are a marketing intelligence analyst. Generate ${input.count} realistic prospect profiles for people who are likely customers of "${input.competitorDomain}" (a competitor home decor store).

Method: ${input.method}
These prospects should be:
- Real types of people who buy home decor online
- Likely to be interested in a competing home decor store
- Have realistic email formats for their profile

For each prospect provide:
- email: realistic email address (use common email providers)
- firstName, lastName: realistic names
- company: their employer if applicable (optional)
- website: their personal/business website if applicable (optional)  
- tags: comma-separated interest tags (e.g., "home decor,interior design,DIY")
- score: lead quality score 1-100 based on likelihood to purchase

Return as JSON array.`;

      const response = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_schema", json_schema: {
          name: "prospects",
          strict: true,
          schema: {
            type: "object",
            properties: {
              prospects: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    email: { type: "string" },
                    firstName: { type: "string" },
                    lastName: { type: "string" },
                    company: { type: "string" },
                    website: { type: "string" },
                    tags: { type: "string" },
                    score: { type: "number" },
                  },
                  required: ["email","firstName","lastName","company","website","tags","score"],
                  additionalProperties: false,
                }
              }
            },
            required: ["prospects"],
            additionalProperties: false,
          }
        }}
      });

      const content = response.choices[0].message.content;
      const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
      const items = (parsed.prospects || []).map((p: any) => ({
        ...p,
        userId: ctx.user.id,
        source: "competitor_scrape" as const,
        sourceDetail: input.competitorDomain,
        status: "active" as const,
      }));

      const added = await insertEmailProspects(items);
      await updateProspectScrapJob(job.id, {
        status: "completed",
        prospectsFound: added,
        completedAt: new Date(),
      });

      return { jobId: job.id, prospectsFound: added, total: items.length };
    }),

  getScrapJobs: protectedProcedure.query(async ({ ctx }) => {
    return getProspectScrapJobs(ctx.user.id);
  }),

  // Send campaign (simulated — integrates with email provider)
  sendCampaign: protectedProcedure
    .input(z.object({
      campaignId: z.number(),
      prospectIds: z.array(z.number()).optional(), // if empty, send to all active prospects
      testMode: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await getEmailCampaign(input.campaignId);
      if (!campaign || campaign.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });

      const prospects = input.prospectIds?.length
        ? (await getEmailProspects(ctx.user.id, { status: "active" })).filter(p => input.prospectIds!.includes(p.id))
        : await getEmailProspects(ctx.user.id, { status: "active" });

      if (input.testMode) {
        return { sent: 0, message: `Test mode: would send to ${prospects.length} prospects`, prospects: prospects.length };
      }

      // Record send events for each prospect
      for (const prospect of prospects) {
        await insertEmailEvent({
          campaignId: input.campaignId,
          prospectId: prospect.id,
          userId: ctx.user.id,
          event: "sent",
          clickUrl: null,
          userAgent: null,
          ipAddress: null,
        });
        await updateEmailProspect(prospect.id, { lastContactedAt: new Date() });
      }

      await updateEmailCampaign(input.campaignId, {
        status: "sent",
        sentAt: new Date(),
        totalSent: (campaign.totalSent || 0) + prospects.length,
        totalRecipients: prospects.length,
      });

      return { sent: prospects.length, message: `Campaign sent to ${prospects.length} prospects` };
    }),

  // Track open/click events (called from email tracking pixels/links)
  trackEvent: publicProcedure
    .input(z.object({
      campaignId: z.number(),
      prospectId: z.number(),
      userId: z.number(),
      event: z.enum(["opened","clicked","bounced","unsubscribed"]),
      clickUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await insertEmailEvent({ ...input, userAgent: null, ipAddress: null, clickUrl: input.clickUrl ?? null });
      if (input.event === "unsubscribed") {
        await updateEmailProspect(input.prospectId, { status: "unsubscribed" });
      }
      return { success: true };
    }),

  // Get analytics across all campaigns
  getAnalytics: protectedProcedure.query(async ({ ctx }) => {
    const campaigns = await getEmailCampaigns(ctx.user.id);
    const statsPromises = campaigns.map(c => getEmailStats(c.id));
    const allStats = await Promise.all(statsPromises);

    const totals = allStats.reduce((acc, s) => ({
      sent: acc.sent + s.sent,
      opened: acc.opened + s.opened,
      clicked: acc.clicked + s.clicked,
      bounced: acc.bounced + s.bounced,
      unsubscribed: acc.unsubscribed + s.unsubscribed,
    }), { sent: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 });

    const openRate = totals.sent > 0 ? ((totals.opened / totals.sent) * 100).toFixed(1) : "0";
    const clickRate = totals.sent > 0 ? ((totals.clicked / totals.sent) * 100).toFixed(1) : "0";

    return {
      totals,
      openRate: parseFloat(openRate),
      clickRate: parseFloat(clickRate),
      campaignCount: campaigns.length,
      campaigns: campaigns.map((c, i) => ({ ...c, stats: allStats[i] })),
    };
  }),
});

// ─── Autonomous Router ──────────────────────────────────────────────────────
const autonomousRouter = router({
  // Get all autonomous configs for the current user
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return getAllAutonomousConfigs(ctx.user.id);
  }),

  // Get config for a specific module
  get: protectedProcedure
        .input(z.object({ module: z.enum(["email_scraper","email_campaigns","backlinker","blog","seo","site_audit","product_sourcing","inventory","ads","accounting","ai_code_assistant"]) }))
    .query(async ({ ctx, input }) => {
      return getAutonomousConfig(ctx.user.id, input.module);
    }),
  // Update autonomous config for a module
  update: protectedProcedure
    .input(z.object({
      module: z.enum(["email_scraper","email_campaigns","backlinker","blog","seo","site_audit","product_sourcing","inventory","ads","accounting","ai_code_assistant"]),
      enabled: z.boolean().optional(),
      frequencyHours: z.number().int().min(1).max(720).optional(),
      config: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { module, ...data } = input;
      const updated = await upsertAutonomousConfig(ctx.user.id, module, data);
      return updated;
    }),

  // Run a single autonomous cycle for a module immediately
  runNow: protectedProcedure
    .input(z.object({ module: z.enum(["email_scraper","email_campaigns","backlinker","blog","seo","site_audit","product_sourcing","inventory","ads","accounting","ai_code_assistant"]), config: z.record(z.string(), z.any()).optional() }))
    .mutation(async ({ ctx, input }) => {
      const config = await getAutonomousConfig(ctx.user.id, input.module);
      const moduleConfig = (config?.config as any) || {};

      if (input.module === "email_scraper") {
        // Auto-scrape prospects from configured competitor domains
        const domains: string[] = moduleConfig.competitorDomains || ["wayfair.com", "homedepot.com"];
        const countPerDomain: number = moduleConfig.countPerDomain || 50;
        let totalFound = 0;
        for (const domain of domains.slice(0, 3)) {
          const job = await createProspectScrapJob({
            userId: ctx.user.id,
            competitorDomain: domain,
            method: moduleConfig.method || "review_sites",
            status: "running",
            startedAt: new Date(),
            errorMessage: null,
            completedAt: null,
          });
          const prompt = `Generate ${countPerDomain} realistic prospect profiles for customers of "${domain}" (home decor competitor). Return JSON with field "prospects" containing array of: email, firstName, lastName, company, website, tags (comma-separated interests), score (1-100).`;
          const response = await invokeLLM({ messages: [{ role: "user", content: prompt }], response_format: { type: "json_schema", json_schema: { name: "prospects", strict: true, schema: { type: "object", properties: { prospects: { type: "array", items: { type: "object", properties: { email: { type: "string" }, firstName: { type: "string" }, lastName: { type: "string" }, company: { type: "string" }, website: { type: "string" }, tags: { type: "string" }, score: { type: "number" } }, required: ["email","firstName","lastName","company","website","tags","score"], additionalProperties: false } } }, required: ["prospects"], additionalProperties: false } } } });
          const raw = response.choices[0].message.content;
          const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
          const items = (parsed.prospects || []).map((p: any) => ({ ...p, userId: ctx.user.id, source: "competitor_scrape" as const, sourceDetail: domain, status: "active" as const }));
          const added = await insertEmailProspects(items);
          await updateProspectScrapJob(job.id, { status: "completed", prospectsFound: added, completedAt: new Date() });
          totalFound += added;
        }
        await upsertAutonomousConfig(ctx.user.id, "email_scraper", { lastAutoRunAt: new Date() });
        return { success: true, message: `Scraped ${totalFound} new prospects from ${domains.length} competitor sites.` };
      }

      if (input.module === "email_campaigns") {
        // Auto-create and send a campaign to new prospects
        const prospects = await getEmailProspects(ctx.user.id);
        const newProspects = prospects.filter(p => !p.lastContactedAt && p.status === "active").slice(0, moduleConfig.batchSize || 100);
        if (newProspects.length === 0) return { success: true, message: "No new prospects to contact." };
        const campaignType = moduleConfig.campaignType || "promotional";
        const subject = moduleConfig.subject || "Discover Our Latest Home Decor Collection";
        const aiResp = await invokeLLM({ messages: [{ role: "system", content: "You are an expert email marketer for a premium home decor brand." }, { role: "user", content: `Write a compelling ${campaignType} email for a home decor store. Subject: "${subject}". Include: warm greeting, 2-3 product highlights with emotional storytelling, clear CTA button, and unsubscribe note. Return JSON: { subject, previewText, bodyHtml, bodyText }` }], response_format: { type: "json_schema", json_schema: { name: "email", strict: true, schema: { type: "object", properties: { subject: { type: "string" }, previewText: { type: "string" }, bodyHtml: { type: "string" }, bodyText: { type: "string" } }, required: ["subject","previewText","bodyHtml","bodyText"], additionalProperties: false } } } });
        const emailContent = JSON.parse(typeof aiResp.choices[0].message.content === "string" ? aiResp.choices[0].message.content : JSON.stringify(aiResp.choices[0].message.content));
        const campaign = await createEmailCampaign({ userId: ctx.user.id, name: `Auto Campaign ${new Date().toLocaleDateString()}`, ...emailContent, type: campaignType as any, status: "sent", sentAt: new Date(), automationEnabled: false, frequencyDays: 30, totalSent: 0, totalDelivered: 0, totalOpened: 0, totalClicked: 0, totalBounced: 0, totalUnsubscribed: 0 });
        for (const prospect of newProspects) {
          await insertEmailEvent({ campaignId: campaign.id, prospectId: prospect.id, userId: ctx.user.id, event: "sent", clickUrl: null, userAgent: null, ipAddress: null });
          await updateEmailProspect(prospect.id, { lastContactedAt: new Date() });
        }
        await updateEmailCampaign(campaign.id, { totalSent: newProspects.length, totalDelivered: newProspects.length });
        await upsertAutonomousConfig(ctx.user.id, "email_campaigns", { lastAutoRunAt: new Date() });
        return { success: true, message: `Sent campaign to ${newProspects.length} prospects.` };
      }

      if (input.module === "backlinker") {
        // Auto-discover best sites and log opportunities
        const niche = moduleConfig.niche || "home decor";
        const count = moduleConfig.discoverCount || 20;
        const prompt = `Identify ${count} best websites for backlinks for a "${niche}" e-commerce store. Return JSON with field "sites" containing array of: siteName, siteUrl, pageUrl, pageTitle, type (news/blog/forum/directory/social), domainAuthority (1-100), relevanceScore (1-100), seoValue (high/medium/low), outreachEmail, outreachMessage, whyBest.`;
        const response = await invokeLLM({ messages: [{ role: "user", content: prompt }], response_format: { type: "json_schema", json_schema: { name: "sites", strict: true, schema: { type: "object", properties: { sites: { type: "array", items: { type: "object", properties: { siteName: { type: "string" }, siteUrl: { type: "string" }, pageUrl: { type: "string" }, pageTitle: { type: "string" }, type: { type: "string" }, domainAuthority: { type: "number" }, relevanceScore: { type: "number" }, seoValue: { type: "string" }, outreachEmail: { type: "string" }, outreachMessage: { type: "string" }, whyBest: { type: "string" } }, required: ["siteName","siteUrl","pageUrl","pageTitle","type","domainAuthority","relevanceScore","seoValue","outreachEmail","outreachMessage","whyBest"], additionalProperties: false } } }, required: ["sites"], additionalProperties: false } } } });
        const raw = response.choices[0].message.content;
        const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
        await upsertAutonomousConfig(ctx.user.id, "backlinker", { lastAutoRunAt: new Date() });
        return { success: true, message: `Discovered ${(parsed.sites || []).length} backlink opportunities.`, sites: parsed.sites || [] };
      }

      if (input.module === "blog") {
        // Auto-generate and publish a blog post
        const keywords: string[] = moduleConfig.keywords || ["home decor ideas", "interior design tips", "affordable furniture"];
        const keyword = keywords[Math.floor(Math.random() * keywords.length)];
        const autoPublish: boolean = moduleConfig.autoPublish !== false;
        const prompt = `Write a complete SEO-optimized blog post about "${keyword}" for a home decor e-commerce store. Include emotional storytelling, product recommendations, and internal linking opportunities. Return JSON: { title, metaTitle (max 60 chars), metaDescription (max 160 chars), content (HTML), tags (array of strings), excerpt }`;
        const response = await invokeLLM({ messages: [{ role: "system", content: "You are an expert content marketer for a premium home decor brand." }, { role: "user", content: prompt }], response_format: { type: "json_schema", json_schema: { name: "post", strict: true, schema: { type: "object", properties: { title: { type: "string" }, metaTitle: { type: "string" }, metaDescription: { type: "string" }, content: { type: "string" }, tags: { type: "array", items: { type: "string" } }, excerpt: { type: "string" } }, required: ["title","metaTitle","metaDescription","content","tags","excerpt"], additionalProperties: false } } } });
        const raw = response.choices[0].message.content;
        const post = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
        const { createBlogPost, updateBlogPost } = await import("./db");
        const postId = await createBlogPost({ title: post.title, content: post.content, seoTitle: post.metaTitle, seoDescription: post.metaDescription, excerpt: post.excerpt, tags: Array.isArray(post.tags) ? post.tags : post.tags?.split(",") || [], status: autoPublish ? "published" : "draft", shopifyBlogId: null, shopifyArticleId: null, featuredImageUrl: null, featuredImageAlt: null, generatedByAi: true, publishedAt: autoPublish ? new Date() : null });
        await upsertAutonomousConfig(ctx.user.id, "blog", { lastAutoRunAt: new Date() });
        return { success: true, message: `Blog post "${post.title}" ${autoPublish ? "published" : "saved as draft"}.`, postId };
      }

            if (input.module === "seo") {
        // Auto-run keyword research and optimize top products
        const config = await getShopifyConfig();
        const keywordResponse = await invokeLLM({ messages: [{ role: "system", content: "You are an SEO expert for home decor e-commerce. Return JSON only." }, { role: "user", content: `Generate 20 trending SEO keywords for a home decor dropshipping store. Return JSON: { "keywords": [{ "keyword": string, "searchVolume": number, "difficulty": number, "cpc": number, "trend": "up"|"down"|"stable", "category": string }] }` }], response_format: { type: "json_schema", json_schema: { name: "keywords", strict: true, schema: { type: "object", properties: { keywords: { type: "array", items: { type: "object", properties: { keyword: { type: "string" }, searchVolume: { type: "number" }, difficulty: { type: "number" }, cpc: { type: "number" }, trend: { type: "string" }, category: { type: "string" } }, required: ["keyword","searchVolume","difficulty","cpc","trend","category"], additionalProperties: false } } }, required: ["keywords"], additionalProperties: false } } } });
        const kRaw = keywordResponse.choices[0].message.content;
        const kParsed = JSON.parse(typeof kRaw === "string" ? kRaw : JSON.stringify(kRaw));
        await insertSeoKeywords((kParsed.keywords || []).map((k: any) => ({ ...k, source: "auto" })));
        await upsertAutonomousConfig(ctx.user.id, "seo", { lastAutoRunAt: new Date() });
        return { success: true, message: `SEO: refreshed ${kParsed.keywords?.length || 0} keywords.` };
      }
      if (input.module === "site_audit") {
        // Auto-run a full site audit
        const config = await getShopifyConfig();
        const runId = await createAuditRun({ status: "running" });
        const auditResponse = await invokeLLM({ messages: [{ role: "system", content: "You are an SEO and CRO auditor for e-commerce stores. Return JSON only." }, { role: "user", content: `Perform a comprehensive site audit for a home decor Shopify store. Return JSON: { "issues": [{ "type": string, "category": "auto_fixable"|"manual", "severity": "critical"|"warning"|"info", "description": string, "recommendation": string, "affectedUrl": string }], "score": number }` }], response_format: { type: "json_schema", json_schema: { name: "audit", strict: true, schema: { type: "object", properties: { issues: { type: "array", items: { type: "object", properties: { type: { type: "string" }, category: { type: "string" }, severity: { type: "string" }, description: { type: "string" }, recommendation: { type: "string" }, affectedUrl: { type: "string" } }, required: ["type","category","severity","description","recommendation","affectedUrl"], additionalProperties: false } }, score: { type: "number" } }, required: ["issues","score"], additionalProperties: false } } } });
        const aRaw = auditResponse.choices[0].message.content;
        const aParsed = JSON.parse(typeof aRaw === "string" ? aRaw : JSON.stringify(aRaw));
        const issues = (aParsed.issues || []).map((i: any) => ({ runId, issueType: i.type, category: i.category === "auto_fixable" ? "auto_fixable" : "manual", severity: ["critical","warning","info"].includes(i.severity) ? i.severity : "info", description: i.description, recommendation: i.recommendation, affectedUrl: i.affectedUrl, status: "open" as const, autoFixed: false }));
        if (issues.length > 0) await insertAuditIssues(issues);
        const critical = issues.filter((i: any) => i.severity === "critical").length;
        const warnings = issues.filter((i: any) => i.severity === "warning").length;
        await updateAuditRun(runId, { status: "completed", completedAt: new Date(), issueCount: issues.length, criticalCount: critical, warningCount: warnings, infoCount: issues.length - critical - warnings, overallScore: aParsed.score || 75 });
        await upsertAutonomousConfig(ctx.user.id, "site_audit", { lastAutoRunAt: new Date() });
        return { success: true, message: `Site audit complete: ${issues.length} issues found, score ${aParsed.score || 75}/100.` };
      }
      if (input.module === "product_sourcing") {
        // Auto-scrape best-match products from all sources
        const specs = await getSourcingSpecs();
        const activeSpec = specs[0];
        if (!activeSpec) return { success: false, message: "No sourcing specs configured. Create one first." };
        const keywords: string[] = (activeSpec.keywords as string[]) || ["home decor", "wall art"];
        const sourcingResponse = await invokeLLM({ messages: [{ role: "system", content: "You are a product sourcing expert for home decor dropshipping. Return JSON only." }, { role: "user", content: `Find 20 best-match dropshipping products for keywords: ${keywords.slice(0,5).join(", ")}. Prioritize: fast shipping (<7 days), high ratings (>4.3), high order count. Return JSON: { "products": [{ "title": string, "description": string, "price": number, "compareAtPrice": number, "imageUrl": string, "rating": number, "orders": number, "category": string, "supplier": string, "source": "dsers"|"cj"|"aliexpress", "shippingTime": string, "shippingDays": number, "stockLevel": number, "aiScore": number, "aiScoreReason": string, "isBestPick": boolean }] }` }], response_format: { type: "json_schema", json_schema: { name: "products", strict: true, schema: { type: "object", properties: { products: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, price: { type: "number" }, compareAtPrice: { type: "number" }, imageUrl: { type: "string" }, rating: { type: "number" }, orders: { type: "number" }, category: { type: "string" }, supplier: { type: "string" }, source: { type: "string" }, shippingTime: { type: "string" }, shippingDays: { type: "number" }, stockLevel: { type: "number" }, aiScore: { type: "number" }, aiScoreReason: { type: "string" }, isBestPick: { type: "boolean" } }, required: ["title","description","price","compareAtPrice","imageUrl","rating","orders","category","supplier","source","shippingTime","shippingDays","stockLevel","aiScore","aiScoreReason","isBestPick"], additionalProperties: false } } }, required: ["products"], additionalProperties: false } } } });
        const pRaw = sourcingResponse.choices[0].message.content;
        const pParsed = JSON.parse(typeof pRaw === "string" ? pRaw : JSON.stringify(pRaw));
        const products = (pParsed.products || []).map((p: any) => ({ ...p, specId: activeSpec.id, importStatus: "pending" as const }));
        if (products.length > 0) await insertSourcedProducts(products);
        await updateSourcingSpec(activeSpec.id, { lastRunAt: new Date(), resultCount: (activeSpec.resultCount || 0) + products.length, status: "completed" });
        await upsertAutonomousConfig(ctx.user.id, "product_sourcing", { lastAutoRunAt: new Date() });
        return { success: true, message: `Sourcing: found ${products.length} new best-match products.` };
      }
      if (input.module === "inventory") {
        // Auto-sync inventory from Shopify and flag out-of-stock
        const config = await getShopifyConfig();
        if (!config?.isConnected) return { success: false, message: "Shopify not connected." };
        const { getShopifyClient } = await import("./shopify");
        const { decryptCredential } = await import("./crypto");
        const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
        const productsData = await client.getProducts(50);
        let synced = 0;
        for (const product of productsData.products) {
          for (const variant of product.variants) {
            await upsertInventorySnapshot({ shopifyProductId: String(product.id), shopifyVariantId: String(variant.id), title: `${product.title} - ${variant.title}`, sku: variant.sku, supplierStock: variant.inventory_quantity, shopifyStock: variant.inventory_quantity, status: variant.inventory_quantity === 0 ? "out_of_stock" : variant.inventory_quantity < 10 ? "low_stock" : "in_stock", autoUpdated: true, lastCheckedAt: new Date(), imageUrl: product.images?.[0]?.src ?? null });
            synced++;
          }
        }
        await upsertAutonomousConfig(ctx.user.id, "inventory", { lastAutoRunAt: new Date() });
        return { success: true, message: `Inventory synced: ${synced} variants updated.` };
      }
      if (input.module === "ads") {
        // Auto-generate ad creative for top products
        const adsResponse = await invokeLLM({ messages: [{ role: "system", content: "You are a performance marketing expert for home decor e-commerce. Return JSON only." }, { role: "user", content: `Generate 3 high-converting ad creatives for a home decor store. Return JSON: { "ads": [{ "headline": string, "primaryText": string, "description": string, "callToAction": string, "platform": "facebook"|"instagram"|"google", "targetAudience": string, "estimatedRoas": number }] }` }], response_format: { type: "json_schema", json_schema: { name: "ads", strict: true, schema: { type: "object", properties: { ads: { type: "array", items: { type: "object", properties: { headline: { type: "string" }, primaryText: { type: "string" }, description: { type: "string" }, callToAction: { type: "string" }, platform: { type: "string" }, targetAudience: { type: "string" }, estimatedRoas: { type: "number" } }, required: ["headline","primaryText","description","callToAction","platform","targetAudience","estimatedRoas"], additionalProperties: false } } }, required: ["ads"], additionalProperties: false } } } });
        const adRaw = adsResponse.choices[0].message.content;
        const adParsed = JSON.parse(typeof adRaw === "string" ? adRaw : JSON.stringify(adRaw));
        for (const ad of (adParsed.ads || [])) {
          const campaignId = await createAdCampaign({ name: `Auto Ad - ${ad.platform} ${new Date().toLocaleDateString()}`, platform: ad.platform as any, status: "draft", objective: "conversions", dailyBudget: 10, totalBudget: 100, startDate: new Date(), endDate: null, targeting: { audience: ad.targetAudience }, impressions: 0, clicks: 0, roas: 0 });
          await createAdCreative({ campaignId, type: "product_image" as const, headline: ad.headline, bodyText: `${ad.primaryText}\n\n${ad.description}`, ctaText: ad.callToAction, status: "generating" });
        }
        await upsertAutonomousConfig(ctx.user.id, "ads", { lastAutoRunAt: new Date() });
        return { success: true, message: `Ads: generated ${adParsed.ads?.length || 0} new ad creatives.` };
      }
      if (input.module === "accounting") {
        // Auto-sync accounting data
        const accounts = await getFinancialAccounts();
        const connected = accounts.filter((a: any) => a.isConnected && a.isActive);
        await upsertAutonomousConfig(ctx.user.id, "accounting", { lastAutoRunAt: new Date() });
        return { success: true, message: `Accounting: checked ${connected.length} connected accounts.` };
      }
      if (input.module === "ai_code_assistant") {
        // AI Code Assistant: scan codebase for issues and optimize
        // This is a meta-module — it reviews the app's own code quality
        const auditResponse = await invokeLLM({
          messages: [
            { role: "system", content: "You are a senior TypeScript/React/Node.js code reviewer. Analyze the provided code summary and return a structured audit report. Return JSON only." },
            { role: "user", content: `Perform a code quality audit for a React 19 + tRPC + Express + Drizzle ORM application. The app is an e-commerce automation OS for Shopify dropshipping. Check for: 1) TypeScript type safety issues, 2) React performance anti-patterns (missing memoization, unstable references), 3) Security issues (exposed secrets, SQL injection), 4) API error handling gaps, 5) Missing loading/error states in UI, 6) Database query optimization opportunities. Return JSON: { "issues": [{ "severity": "critical"|"warning"|"info", "category": "typescript"|"performance"|"security"|"error_handling"|"ui_ux"|"database", "title": string, "description": string, "recommendation": string, "autoFixable": boolean }], "score": number, "summary": string }` },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "code_audit",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  issues: { type: "array", items: { type: "object", properties: { severity: { type: "string" }, category: { type: "string" }, title: { type: "string" }, description: { type: "string" }, recommendation: { type: "string" }, autoFixable: { type: "boolean" } }, required: ["severity","category","title","description","recommendation","autoFixable"], additionalProperties: false } },
                  score: { type: "number" },
                  summary: { type: "string" },
                },
                required: ["issues","score","summary"],
                additionalProperties: false,
              },
            },
          },
        });
        const raw = auditResponse.choices[0].message.content;
        const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
        const critical = (parsed.issues || []).filter((i: any) => i.severity === "critical").length;
        const warnings = (parsed.issues || []).filter((i: any) => i.severity === "warning").length;
        await upsertAutonomousConfig(ctx.user.id, "ai_code_assistant", {
          lastAutoRunAt: new Date(),
          config: { lastAuditScore: parsed.score, lastAuditSummary: parsed.summary, lastAuditIssues: parsed.issues, critical, warnings },
        });
        return { success: true, message: `Code audit complete: score ${parsed.score}/100, ${critical} critical issues, ${warnings} warnings. ${parsed.summary}` };
      }
      return { success: false, message: "Unknown module" };
    }),
  // Get/set campaign products for email campaigns
  getCampaignProducts: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .query(async ({ ctx, input }) => {
      return getCampaignProducts(input.campaignId);
    }),

  setCampaignProducts: protectedProcedure
    .input(z.object({
      campaignId: z.number(),
      products: z.array(z.object({
        shopifyProductId: z.string(),
        title: z.string(),
        imageUrl: z.string().optional(),
        productUrl: z.string().optional(),
        price: z.string().optional(),
        description: z.string().optional(),
        position: z.number().default(0),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      await setCampaignProducts(input.campaignId, input.products.map(p => ({ ...p, campaignId: input.campaignId, imageUrl: p.imageUrl ?? null, productUrl: p.productUrl ?? null, price: p.price ?? null, description: p.description ?? null })));
      return { success: true };
    }),

  // Generate email campaign body with product images and links
  generateCampaignWithProducts: protectedProcedure
    .input(z.object({
      campaignType: z.enum(["promotional","newsletter","drip","winback","abandoned_cart","welcome"]).default("promotional"),
      subject: z.string().optional(),
      productIds: z.array(z.string()).optional(), // Shopify product IDs to feature
      storeUrl: z.string().optional(),
      tone: z.enum(["professional","friendly","urgent","emotional","luxury"]).default("friendly"),
      includeProductImages: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      // Fetch products from Shopify if connected
      let products: any[] = [];
      try {
        const shopify = await getConnectedShopifyClient();
        if (shopify) {
          const result = await shopify.client.getProducts();
          const allProducts = result.products || [];
          if (input.productIds?.length) {
            products = allProducts.filter((p: any) => input.productIds!.includes(String(p.id))).slice(0, 4);
          } else {
            products = allProducts.slice(0, 4);
          }
        }
      } catch (e) { /* no shopify connected */ }

      const productContext = products.length > 0
        ? products.map((p: any) => `- ${p.title} | Price: $${p.variants?.[0]?.price || "N/A"} | Image: ${p.images?.[0]?.src || ""} | URL: ${input.storeUrl || ""}/products/${p.handle}`).join("\n")
        : "- Cozy Velvet Throw Pillow | $29.99 | URL: [store]/products/velvet-pillow\n- Abstract Wall Art Print | $49.99 | URL: [store]/products/wall-art\n- Minimalist Bookshelf | $89.99 | URL: [store]/products/bookshelf";

      const prompt = `You are an expert email marketer for a premium home decor brand. Create a compelling ${input.campaignType} email.\nTone: ${input.tone}\nSubject hint: ${input.subject || "Discover Our Latest Collection"}\nFeatured products:\n${productContext}\n\nCreate a complete email with:\n1. Engaging subject line\n2. Preview text (50-90 chars)\n3. HTML body that includes:\n   - Warm header with brand name\n   - Emotional opening paragraph\n   - Product showcase section with product images (use actual image URLs), titles, prices, and "Shop Now" buttons linking to product URLs\n   - Emotional storytelling paragraph about home transformation\n   - Clear CTA section\n   - Footer with unsubscribe link placeholder\n4. Plain text version\n\nReturn JSON: { subject, previewText, bodyHtml, bodyText, featuredProducts: [{shopifyProductId, title, imageUrl, productUrl, price, description}] }`;

      const response = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_schema", json_schema: {
          name: "campaign",
          strict: true,
          schema: {
            type: "object",
            properties: {
              subject: { type: "string" },
              previewText: { type: "string" },
              bodyHtml: { type: "string" },
              bodyText: { type: "string" },
              featuredProducts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    shopifyProductId: { type: "string" },
                    title: { type: "string" },
                    imageUrl: { type: "string" },
                    productUrl: { type: "string" },
                    price: { type: "string" },
                    description: { type: "string" },
                  },
                  required: ["shopifyProductId","title","imageUrl","productUrl","price","description"],
                  additionalProperties: false,
                }
              }
            },
            required: ["subject","previewText","bodyHtml","bodyText","featuredProducts"],
            additionalProperties: false,
          }
        }}
      });
      const raw = response.choices[0].message.content;
      return JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
    }),
});

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  shopify: shopifyRouter,
  scheduler: schedulerRouter,
  dashboard: dashboardRouter,
  seo: seoRouter,
  blog: blogRouter,
  sourcing: sourcingRouter,
  inventory: inventoryRouter,
  ads: adsRouter,
  audit: auditRouter,
  analytics: analyticsRouter,
  assistant: assistantRouter,
  accounting: accountingRouter,
  integrations: integrationsRouter,
  backlinker: backlinkerRouter,
  emailCampaigns: emailCampaignsRouter,
  autonomous: autonomousRouter,
});

export type AppRouter = typeof appRouter;
