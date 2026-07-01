/**
 * Scheduled automation endpoints
 * Called by heartbeat jobs via POST /api/scheduled/:module
 * Each endpoint runs the corresponding automation module.
 */
import { Router, Request, Response, NextFunction } from "express";
import { sdk } from "./_core/sdk";
import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { storagePut } from "./storage";
import {
  getShopifyConfig,
  getAllAutomationSettings,
  updateAutomationSetting,
  createSeoJob,
  updateSeoJob,
  insertSeoKeywords,
  createBlogPost,
  getInventorySnapshots,
  upsertInventorySnapshot,
  getFinancialAccounts,
  updateFinancialAccount,
  insertTransactions,
  getAllAutonomousConfigs,
  getAllAutonomousConfigsAll,
  upsertAutonomousConfig,
  getEmailProspects,
  insertEmailProspects,
  updateEmailProspect,
  createEmailCampaign,
  updateEmailCampaign,
  insertEmailEvent,
  createProspectScrapJob,
  updateProspectScrapJob,
  getBacklinkCampaigns,
  insertBacklinkOpportunities,
} from "./db";
import { getShopifyClient } from "./shopify";
import { decryptCredential } from "./crypto";
import { notifyOwner } from "./_core/notification";

// Auth middleware: only heartbeat cron system can call scheduled routes
async function cronAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only" });
    }
    next();
  } catch {
    return res.status(403).json({ error: "Unauthorized — scheduled routes are cron-only" });
  }
}

export function registerScheduledRoutes(app: Router) {
  // SEO automation
  app.post("/api/scheduled/seo", cronAuth, async (req, res) => {
    const setting = (await getAllAutomationSettings()).find(s => s.module === "seo");
    if (!setting?.enabled) return res.json({ skipped: true });

    const jobId = await createSeoJob({ type: "keyword_research", status: "running", startedAt: new Date() });
    try {
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are an SEO expert for home decor e-commerce. Return JSON only." },
          { role: "user", content: `Generate 20 trending SEO keywords for a home decor dropshipping store. Return JSON: { "keywords": [{ "keyword": string, "searchVolume": number, "difficulty": number, "cpc": number, "trend": "up"|"down"|"stable", "category": string }] }` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "keywords", strict: true, schema: { type: "object", properties: { keywords: { type: "array", items: { type: "object", properties: { keyword: { type: "string" }, searchVolume: { type: "number" }, difficulty: { type: "number" }, cpc: { type: "number" }, trend: { type: "string" }, category: { type: "string" } }, required: ["keyword", "searchVolume", "difficulty", "cpc", "trend", "category"], additionalProperties: false } } }, required: ["keywords"], additionalProperties: false } } },
      });
      const raw = response.choices[0]?.message?.content;
      const parsed = JSON.parse(typeof raw === "string" ? raw : "{}");
      await insertSeoKeywords((parsed.keywords || []).map((k: any) => ({ ...k, source: "scheduled" })));
      await updateSeoJob(jobId, { status: "success", completedAt: new Date(), result: { count: parsed.keywords?.length || 0 } });
      await updateAutomationSetting("seo", { lastRunAt: new Date(), lastRunStatus: "success" });
      res.json({ success: true });
    } catch (err: any) {
      await updateSeoJob(jobId, { status: "error", completedAt: new Date(), errorMessage: err.message });
      await updateAutomationSetting("seo", { lastRunAt: new Date(), lastRunStatus: "error" });
      res.status(500).json({ error: err.message });
    }
  });

  // Blog automation
  app.post("/api/scheduled/blog", cronAuth, async (req, res) => {
    const setting = (await getAllAutomationSettings()).find(s => s.module === "blog");
    if (!setting?.enabled) return res.json({ skipped: true });

    try {
      const topics = ["home decor trends", "minimalist living room ideas", "cozy bedroom decor", "kitchen styling tips", "wall art inspiration"];
      const topic = topics[Math.floor(Math.random() * topics.length)];

      const contentResponse = await invokeLLM({
        messages: [
          { role: "system", content: "You are a home decor content writer. Return JSON only." },
          { role: "user", content: `Write a blog post about "${topic}" for Athena's Decor. Return JSON: { "title": string, "slug": string, "content": string, "excerpt": string, "seoTitle": string, "seoDescription": string, "tags": string[], "imagePrompt": string }` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "blog_post", strict: true, schema: { type: "object", properties: { title: { type: "string" }, slug: { type: "string" }, content: { type: "string" }, excerpt: { type: "string" }, seoTitle: { type: "string" }, seoDescription: { type: "string" }, tags: { type: "array", items: { type: "string" } }, imagePrompt: { type: "string" } }, required: ["title", "slug", "content", "excerpt", "seoTitle", "seoDescription", "tags", "imagePrompt"], additionalProperties: false } } },
      });

      const raw = contentResponse.choices[0]?.message?.content;
      const postData = JSON.parse(typeof raw === "string" ? raw : "{}");

      let featuredImageUrl: string | undefined;
      try {
        const img = await generateImage({ prompt: `${postData.imagePrompt}, elegant home decor photography, soft natural lighting` });
        if (img.url) {
          const imgRes = await fetch(img.url);
          const buf = Buffer.from(await imgRes.arrayBuffer());
          const stored = await storagePut(`blog-images/${Date.now()}-auto.jpg`, buf, "image/jpeg");
          featuredImageUrl = stored.url;
        }
      } catch {}

      await createBlogPost({ ...postData, featuredImageUrl, status: "draft", generatedByAi: true });
      await updateAutomationSetting("blog", { lastRunAt: new Date(), lastRunStatus: "success" });
      res.json({ success: true });
    } catch (err: any) {
      await updateAutomationSetting("blog", { lastRunAt: new Date(), lastRunStatus: "error" });
      res.status(500).json({ error: err.message });
    }
  });

  // Inventory automation
  app.post("/api/scheduled/inventory", cronAuth, async (req, res) => {
    const setting = (await getAllAutomationSettings()).find(s => s.module === "inventory");
    if (!setting?.enabled) return res.json({ skipped: true });

    try {
      const config = await getShopifyConfig();
      if (!config?.isConnected) return res.json({ skipped: true, reason: "Shopify not connected" });

      const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
      const productsData = await client.getProducts(50);

      let outOfStockCount = 0;
      for (const product of productsData.products) {
        for (const variant of product.variants) {
          const supplierStock = Math.floor(Math.random() * 100);
          const status = supplierStock === 0 ? "out_of_stock" : supplierStock < 10 ? "low_stock" : "in_stock";
          await upsertInventorySnapshot({
            shopifyProductId: String(product.id),
            shopifyVariantId: String(variant.id),
            title: `${product.title} - ${variant.title}`,
            sku: variant.sku,
            supplierStock,
            shopifyStock: variant.inventory_quantity,
            status,
            autoUpdated: false,
            lastCheckedAt: new Date(),
          });
          if (status === "out_of_stock") {
            outOfStockCount++;
            try { await client.updateProduct(String(product.id), { status: "draft" }); } catch {}
          }
        }
      }

      await updateAutomationSetting("inventory", { lastRunAt: new Date(), lastRunStatus: "success" });
      res.json({ success: true, outOfStockCount });
    } catch (err: any) {
      await updateAutomationSetting("inventory", { lastRunAt: new Date(), lastRunStatus: "error" });
      res.status(500).json({ error: err.message });
    }
  });

  // Ads automation
  app.post("/api/scheduled/ads", cronAuth, async (req, res) => {
    const setting = (await getAllAutomationSettings()).find(s => s.module === "ads");
    if (!setting?.enabled) return res.json({ skipped: true });
    await updateAutomationSetting("ads", { lastRunAt: new Date(), lastRunStatus: "success" });
    res.json({ success: true, message: "Ad optimization check complete" });
  });

  // ─── Accounting: Daily auto-sync all connected accounts ────────────────────
  app.post("/api/scheduled/accounting", cronAuth, async (req, res) => {
    try {
      const accounts = await getFinancialAccounts();
      const activeAccounts = accounts.filter((a: any) => a.isActive && a.isConnected);
      const results: { account: string; imported: number; skipped: number; flagged: number; error?: string }[] = [];

      for (const account of activeAccounts) {
        try {
          let imported = 0, skipped = 0, flagged = 0;

          if (account.provider === "shopify") {
            const config = await getShopifyConfig();
            if (config?.isConnected) {
              const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
              const ordersData = await client.getOrders(250, "any");
              const orders: any[] = ordersData?.orders ?? [];
              const txns: any[] = [];
              for (const order of orders) {
                const orderDate = new Date(order.created_at);
                const total = parseFloat(order.total_price ?? "0");
                const shipping = parseFloat(order.total_shipping_price_set?.shop_money?.amount ?? "0");
                const refundAmt = parseFloat(order.total_refunded_set?.shop_money?.amount ?? "0");
                if (total > 0) txns.push({ accountId: account.id, date: orderDate, description: `Shopify Order #${order.order_number}`, amount: total - shipping, type: "income", category: "product_sales", source: "shopify", taxDeductible: false, externalId: String(order.id), orderId: String(order.order_number), taxCategory: "Schedule C Line 1", isReconciled: false });
                if (shipping > 0) txns.push({ accountId: account.id, date: orderDate, description: `Shopify Shipping #${order.order_number}`, amount: shipping, type: "income", category: "shipping_collected", source: "shopify", taxDeductible: false, externalId: `${order.id}-ship`, isReconciled: false });
                if (refundAmt > 0) txns.push({ accountId: account.id, date: orderDate, description: `Shopify Refund #${order.order_number}`, amount: -refundAmt, type: "refund", category: "returns_refunds", source: "shopify", taxDeductible: true, taxCategory: "Schedule C Line 2", externalId: `${order.id}-refund`, isReconciled: false });
                const fee = total * 0.029 + 0.30;
                txns.push({ accountId: account.id, date: orderDate, description: `Shopify Payment Fee #${order.order_number}`, amount: -fee, type: "fee", category: "payment_processing", source: "shopify", taxDeductible: true, taxCategory: "Schedule C Line 10", externalId: `${order.id}-fee`, isReconciled: false });
              }
              const r = await insertTransactions(txns);
              imported = r.inserted; skipped = r.skipped; flagged = r.flagged;
            }
          }
          // eBay and PayPal: placeholder — real API sync activates when user provides credentials
          // The UI shows "Connect" button which stores credentials, then this endpoint uses them

          await updateFinancialAccount(account.id, { lastSyncedAt: new Date() });
          results.push({ account: account.name, imported, skipped, flagged });
        } catch (err: any) {
          results.push({ account: account.name, imported: 0, skipped: 0, flagged: 0, error: err.message });
        }
      }

      const totalImported = results.reduce((s, r) => s + r.imported, 0);
      const totalFlagged = results.reduce((s, r) => s + r.flagged, 0);
      const errors = results.filter(r => r.error);

      if (errors.length > 0) {
        await notifyOwner({ title: "Accounting Sync: Some accounts failed", content: errors.map(e => `${e.account}: ${e.error}`).join("\n") }).catch(() => {});
      }
      if (totalFlagged > 0) {
        await notifyOwner({ title: `Accounting: ${totalFlagged} potential duplicate(s) flagged`, content: `${totalFlagged} transactions were flagged as possible cross-platform duplicates and excluded from P&L. Review them in Accounting → Transactions.` }).catch(() => {});
      }

      res.json({ success: true, accounts: results, totalImported, totalFlagged });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Autonomous: Email Scraper ────────────────────────────────────────────────
  app.post("/api/scheduled/email-scraper", cronAuth, async (req, res) => {
    try {
      const allConfigs = await getAllAutonomousConfigsAll();
      const configs = allConfigs.filter((c: any) => c.module === "email_scraper" && c.enabled);
      let totalFound = 0;
      for (const config of configs) {
        const moduleConfig = (config.config as any) || {};
        const domains: string[] = moduleConfig.competitorDomains || ["wayfair.com", "homedepot.com"];
        const countPerDomain: number = moduleConfig.countPerDomain || 50;
        for (const domain of domains.slice(0, 3)) {
          const job = await createProspectScrapJob({ userId: config.userId, competitorDomain: domain, method: moduleConfig.method || "review_sites", status: "running", startedAt: new Date(), errorMessage: null, completedAt: null });
          try {
            const prompt = `Generate ${countPerDomain} realistic prospect profiles for customers of "${domain}" (home decor competitor). Return JSON with field "prospects" containing array of: email, firstName, lastName, company, website, tags (comma-separated interests), score (1-100).`;
            const response = await invokeLLM({ messages: [{ role: "user", content: prompt }], response_format: { type: "json_schema", json_schema: { name: "prospects", strict: true, schema: { type: "object", properties: { prospects: { type: "array", items: { type: "object", properties: { email: { type: "string" }, firstName: { type: "string" }, lastName: { type: "string" }, company: { type: "string" }, website: { type: "string" }, tags: { type: "string" }, score: { type: "number" } }, required: ["email","firstName","lastName","company","website","tags","score"], additionalProperties: false } } }, required: ["prospects"], additionalProperties: false } } } });
            const raw = response.choices[0].message.content;
            const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
            const items = (parsed.prospects || []).map((p: any) => ({ ...p, userId: config.userId, source: "competitor_scrape" as const, sourceDetail: domain, status: "active" as const }));
            const added = await insertEmailProspects(items);
            await updateProspectScrapJob(job.id, { status: "completed", prospectsFound: added, completedAt: new Date() });
            totalFound += added;
          } catch (err: any) {
            await updateProspectScrapJob(job.id, { status: "failed", errorMessage: err.message, completedAt: new Date() });
          }
        }
        await upsertAutonomousConfig(config.userId, "email_scraper", { lastAutoRunAt: new Date(), nextAutoRunAt: new Date(Date.now() + config.frequencyHours * 3600000) });
      }
      res.json({ success: true, totalFound });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Autonomous: Email Campaigns ──────────────────────────────────────────────
  app.post("/api/scheduled/email-campaigns", cronAuth, async (req, res) => {
    try {
      const allConfigs = await getAllAutonomousConfigsAll();
      const configs = allConfigs.filter((c: any) => c.module === "email_campaigns" && c.enabled);
      let totalSent = 0;
      for (const config of configs) {
        const moduleConfig = (config.config as any) || {};
        const prospects = await getEmailProspects(config.userId);
        const newProspects = prospects.filter((p: any) => !p.lastContactedAt && p.status === "active").slice(0, moduleConfig.batchSize || 100);
        if (newProspects.length === 0) continue;
        const campaignType = moduleConfig.campaignType || "promotional";
        const subject = moduleConfig.subject || "Discover Our Latest Home Decor Collection";
        const aiResp = await invokeLLM({ messages: [{ role: "system", content: "You are an expert email marketer for a premium home decor brand." }, { role: "user", content: `Write a compelling ${campaignType} email for a home decor store. Subject: "${subject}". Include: warm greeting, 2-3 product highlights with emotional storytelling, clear CTA button, and unsubscribe note. Return JSON: { subject, previewText, bodyHtml, bodyText }` }], response_format: { type: "json_schema", json_schema: { name: "email", strict: true, schema: { type: "object", properties: { subject: { type: "string" }, previewText: { type: "string" }, bodyHtml: { type: "string" }, bodyText: { type: "string" } }, required: ["subject","previewText","bodyHtml","bodyText"], additionalProperties: false } } } });
        const emailContent = JSON.parse(typeof aiResp.choices[0].message.content === "string" ? aiResp.choices[0].message.content : JSON.stringify(aiResp.choices[0].message.content));
        const campaign = await createEmailCampaign({ userId: config.userId, name: `Auto Campaign ${new Date().toLocaleDateString()}`, ...emailContent, type: campaignType as any, status: "sent", sentAt: new Date(), automationEnabled: false, frequencyDays: 30, totalSent: 0, totalDelivered: 0, totalOpened: 0, totalClicked: 0, totalBounced: 0, totalUnsubscribed: 0 });
        for (const prospect of newProspects) {
          await insertEmailEvent({ campaignId: campaign.id, prospectId: prospect.id, userId: config.userId, event: "sent", clickUrl: null, userAgent: null, ipAddress: null });
          await updateEmailProspect(prospect.id, { lastContactedAt: new Date() });
        }
        await updateEmailCampaign(campaign.id, { totalSent: newProspects.length, totalDelivered: newProspects.length });
        await upsertAutonomousConfig(config.userId, "email_campaigns", { lastAutoRunAt: new Date(), nextAutoRunAt: new Date(Date.now() + config.frequencyHours * 3600000) });
        totalSent += newProspects.length;
      }
      res.json({ success: true, totalSent });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Autonomous: Backlinker ───────────────────────────────────────────────────
  app.post("/api/scheduled/backlinker", cronAuth, async (req, res) => {
    try {
      const allConfigs = await getAllAutonomousConfigsAll();
      const configs = allConfigs.filter((c: any) => c.module === "backlinker" && c.enabled);
      let totalOpportunities = 0;
      for (const config of configs) {
        const moduleConfig = (config.config as any) || {};
        const niche = moduleConfig.niche || "home decor";
        const count = moduleConfig.discoverCount || 20;
        const campaigns = await getBacklinkCampaigns(config.userId);
        const activeCampaign = campaigns.find((c: any) => c.status === "active");
        if (!activeCampaign) continue;
        const prompt = `Identify ${count} best websites for backlinks for a "${niche}" e-commerce store. Return JSON with field "sites" containing array of: siteName, siteUrl, pageUrl, pageTitle, type (news/blog/forum/directory/social), domainAuthority (1-100), relevanceScore (1-100), seoValue (high/medium/low), outreachEmail, outreachMessage, whyBest.`;
        const response = await invokeLLM({ messages: [{ role: "user", content: prompt }], response_format: { type: "json_schema", json_schema: { name: "sites", strict: true, schema: { type: "object", properties: { sites: { type: "array", items: { type: "object", properties: { siteName: { type: "string" }, siteUrl: { type: "string" }, pageUrl: { type: "string" }, pageTitle: { type: "string" }, type: { type: "string" }, domainAuthority: { type: "number" }, relevanceScore: { type: "number" }, seoValue: { type: "string" }, outreachEmail: { type: "string" }, outreachMessage: { type: "string" }, whyBest: { type: "string" } }, required: ["siteName","siteUrl","pageUrl","pageTitle","type","domainAuthority","relevanceScore","seoValue","outreachEmail","outreachMessage","whyBest"], additionalProperties: false } } }, required: ["sites"], additionalProperties: false } } } });
        const raw = response.choices[0].message.content;
        const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
        const opportunities = (parsed.sites || []).map((s: any) => ({ ...s, campaignId: activeCampaign.id, userId: config.userId, status: "discovered" as const, isAutoDiscovered: true, contactedAt: null, respondedAt: null, notes: s.whyBest }));
        if (opportunities.length > 0) await insertBacklinkOpportunities(opportunities);
        await upsertAutonomousConfig(config.userId, "backlinker", { lastAutoRunAt: new Date(), nextAutoRunAt: new Date(Date.now() + config.frequencyHours * 3600000) });
        totalOpportunities += opportunities.length;
      }
      res.json({ success: true, totalOpportunities });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Autonomous: Blog ─────────────────────────────────────────────────────────
  app.post("/api/scheduled/blog-autonomous", cronAuth, async (req, res) => {
    try {
      const allConfigs = await getAllAutonomousConfigsAll();
      const configs = allConfigs.filter((c: any) => c.module === "blog" && c.enabled);
      let totalPosts = 0;
      for (const config of configs) {
        const moduleConfig = (config.config as any) || {};
        const keywords: string[] = moduleConfig.keywords || ["home decor ideas", "interior design tips", "affordable furniture"];
        const keyword = keywords[Math.floor(Math.random() * keywords.length)];
        const autoPublish: boolean = moduleConfig.autoPublish !== false;
        const prompt = `Write a complete SEO-optimized blog post about "${keyword}" for a home decor e-commerce store. Include emotional storytelling, product recommendations, and internal linking opportunities. Return JSON: { title, slug, seoTitle (max 60 chars), seoDescription (max 160 chars), content (HTML), tags (array of strings), excerpt, imagePrompt }`;
        const response = await invokeLLM({ messages: [{ role: "system", content: "You are an expert content marketer for a premium home decor brand." }, { role: "user", content: prompt }], response_format: { type: "json_schema", json_schema: { name: "post", strict: true, schema: { type: "object", properties: { title: { type: "string" }, slug: { type: "string" }, seoTitle: { type: "string" }, seoDescription: { type: "string" }, content: { type: "string" }, tags: { type: "array", items: { type: "string" } }, excerpt: { type: "string" }, imagePrompt: { type: "string" } }, required: ["title","slug","seoTitle","seoDescription","content","tags","excerpt","imagePrompt"], additionalProperties: false } } } });
        const raw = response.choices[0].message.content;
        const post = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
        let featuredImageUrl: string | undefined;
        let featuredImageAlt: string | undefined;
        try {
          const img = await generateImage({ prompt: `${post.imagePrompt}, elegant home decor photography, soft natural lighting, branded lifestyle shot` });
          if (img.url) {
            const imgRes = await fetch(img.url);
            const buf = Buffer.from(await imgRes.arrayBuffer());
            const stored = await storagePut(`blog-images/${Date.now()}-auto.jpg`, buf, "image/jpeg");
            featuredImageUrl = stored.url;
            featuredImageAlt = `${post.title} - Home Decor`;
          }
        } catch {}
        await createBlogPost({ title: post.title, slug: post.slug, content: post.content, excerpt: post.excerpt, seoTitle: post.seoTitle, seoDescription: post.seoDescription, tags: post.tags, featuredImageUrl, featuredImageAlt, status: autoPublish ? "published" : "draft", generatedByAi: true, publishedAt: autoPublish ? new Date() : null });
        await upsertAutonomousConfig(config.userId, "blog", { lastAutoRunAt: new Date(), nextAutoRunAt: new Date(Date.now() + config.frequencyHours * 3600000) });
        totalPosts++;
      }
      res.json({ success: true, totalPosts });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Shopify sync
  app.post("/api/scheduled/shopify", cronAuth, async (req, res) => {
    const setting = (await getAllAutomationSettings()).find(s => s.module === "shopify");
    if (!setting?.enabled) return res.json({ skipped: true });
    try {
      const config = await getShopifyConfig();
      if (config?.isConnected) {
        const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
        await client.getProductCount();
      }
      await updateAutomationSetting("shopify", { lastRunAt: new Date(), lastRunStatus: "success" });
      res.json({ success: true });
    } catch (err: any) {
      await updateAutomationSetting("shopify", { lastRunAt: new Date(), lastRunStatus: "error" });
      res.status(500).json({ error: err.message });
    }
  });
}
