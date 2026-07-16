/**
 * AI suggestions feed: gathers real store data, asks the LLM to propose a
 * short list of concrete next actions grounded in that data, and stores
 * them for the owner to approve or deny on the Dashboard. Approving a
 * suggestion runs the same real automation function the rest of the app
 * uses (site audit, inventory scan, fulfillment, ad optimization, blog
 * generation) — never a fabricated "done" with nothing behind it.
 */
import { invokeLLM } from "./_core/llm";
import {
  getShopifyConfig, getInventoryGroupedByProduct, getLatestAuditRun, getOpenAuditIssues,
  getBlogPosts, getAdCampaigns, getPendingAiSuggestions, getRecentAiSuggestions, insertAiSuggestions,
  updateAiSuggestion, getAiSuggestionById, logActivity,
} from "./db";
import type { AiSuggestion } from "../drizzle/schema";
import { runFullAudit, applyAllAuditFixes } from "./auditRunner";
import { runInventoryScan } from "./inventoryRunner";
import { runAutoFulfillment } from "./fulfillmentRunner";
import { optimizeActiveCampaignBudgets } from "./adsRunner";
import { createAndPublishBlogPost } from "./blogPublish";

const ALLOWED_ACTION_TYPES = [
  "run_site_audit",
  "apply_audit_fixes",
  "run_inventory_scan",
  "run_fulfillment",
  "optimize_ad_budgets",
  "generate_blog_post",
] as const;
type ActionType = typeof ALLOWED_ACTION_TYPES[number];

// Throttles generation to roughly once every 2 hours regardless of caller
// (scheduled poll or Dashboard-triggered) — reads the most recent
// suggestion's timestamp rather than in-memory state, so it holds even
// across server restarts / multiple instances.
const MIN_REGEN_INTERVAL_MS = 2 * 3600_000;

export async function generateAiSuggestions(): Promise<{ created: number }> {
  const [pending, recent] = await Promise.all([getPendingAiSuggestions(), getRecentAiSuggestions(1)]);
  if (recent[0] && Date.now() - new Date(recent[0].createdAt).getTime() < MIN_REGEN_INTERVAL_MS) {
    return { created: 0 };
  }
  // Don't pile up new suggestions on top of ones the owner hasn't acted on.
  if (pending.length >= 5) return { created: 0 };

  const config = await getShopifyConfig();
  if (!config?.isConnected) return { created: 0 }; // nothing real to analyze yet

  const [inventory, latestAudit, blogPosts, campaigns] = await Promise.all([
    getInventoryGroupedByProduct(),
    getLatestAuditRun(),
    getBlogPosts(5),
    getAdCampaigns(),
  ]);
  const openAuditIssues = latestAudit ? await getOpenAuditIssues(latestAudit.id) : [];
  const outOfStockCount = inventory.filter((p) => p.status === "out_of_stock").length;
  const lowStockCount = inventory.filter((p) => p.status === "low_stock").length;
  const daysSinceLastPost = blogPosts[0] ? Math.round((Date.now() - new Date(blogPosts[0].createdAt).getTime()) / 86400000) : null;
  const activeCampaignsNeedingAttention = campaigns.filter((c: any) => c.status === "active" && c.impressions > 0).length;

  const signals = {
    productCount: inventory.length,
    outOfStockProductCount: outOfStockCount,
    lowStockProductCount: lowStockCount,
    hasEverRunSiteAudit: !!latestAudit,
    latestAuditOverallScore: latestAudit?.overallScore ?? null,
    latestAuditRanDaysAgo: latestAudit ? Math.round((Date.now() - new Date(latestAudit.createdAt).getTime()) / 86400000) : null,
    openAuditIssueCount: openAuditIssues.length,
    totalBlogPosts: blogPosts.length,
    daysSinceLastBlogPost: daysSinceLastPost,
    activeCampaignsWithTraffic: activeCampaignsNeedingAttention,
  };

  // Only bother the LLM (and the owner) when there's something concrete to flag.
  const hasSignal =
    outOfStockCount > 0 ||
    signals.openAuditIssueCount > 0 ||
    !signals.hasEverRunSiteAudit ||
    (signals.latestAuditRanDaysAgo !== null && signals.latestAuditRanDaysAgo > 7) ||
    signals.daysSinceLastBlogPost === null ||
    (signals.daysSinceLastBlogPost !== null && signals.daysSinceLastBlogPost > 7) ||
    signals.activeCampaignsWithTraffic > 0;
  if (!hasSignal) return { created: 0 };

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are an operations analyst for a Shopify home decor store. You only ever suggest actions from a fixed allow-list, and every suggestion must be directly justified by the real numbers given to you. Never invent data, and never suggest an action type outside the allow-list.",
      },
      {
        role: "user",
        content: `Real current store data:\n${JSON.stringify(signals, null, 2)}\n\nOpen audit issues (up to 5, if any): ${JSON.stringify(openAuditIssues.slice(0, 5).map((i) => ({ issueType: i.issueType, severity: i.severity, description: i.description })))}\n\nAllow-listed action types: ${ALLOWED_ACTION_TYPES.join(", ")}.\nRules:\n- "apply_audit_fixes" only if openAuditIssueCount > 0.\n- "run_site_audit" if hasEverRunSiteAudit is false or latestAuditRanDaysAgo > 7.\n- "run_inventory_scan" only if outOfStockProductCount > 0 or lowStockProductCount > 0.\n- "run_fulfillment" only if that seems like a genuinely useful nudge (this data doesn't show pending orders directly, so only suggest it if nothing else is more clearly justified).\n- "optimize_ad_budgets" only if activeCampaignsWithTraffic > 0.\n- "generate_blog_post" only if daysSinceLastBlogPost is null or > 7; include a specific, on-brand topic string in payload.topic.\nPropose at most 3 suggestions, only the ones clearly justified — return fewer if that's all that's justified, or an empty array if nothing is.\nReturn JSON: { "suggestions": [{ "actionType": string, "title": string (short, specific, under 80 chars), "reasoning": string (must reference the actual numbers above), "module": string, "payload": object }] }`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "suggestions",
        strict: true,
        schema: {
          type: "object",
          properties: {
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  actionType: { type: "string" },
                  title: { type: "string" },
                  reasoning: { type: "string" },
                  module: { type: "string" },
                  payload: { type: "object", additionalProperties: true },
                },
                required: ["actionType", "title", "reasoning", "module", "payload"],
                additionalProperties: false,
              },
            },
          },
          required: ["suggestions"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = response.choices[0].message.content;
  const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
  const valid = (parsed.suggestions ?? []).filter((s: any) => ALLOWED_ACTION_TYPES.includes(s.actionType));
  if (valid.length === 0) return { created: 0 };

  const created = await insertAiSuggestions(
    valid.map((s: any) => ({
      module: String(s.module ?? "").slice(0, 64) || "general",
      actionType: s.actionType,
      title: String(s.title).slice(0, 255),
      reasoning: String(s.reasoning),
      actionPayload: s.actionType === "apply_audit_fixes" ? { runId: latestAudit?.id ?? null } : s.payload,
    }))
  );
  await logActivity({
    module: "ai_suggestions",
    level: "info",
    title: `AI generated ${created} suggestion(s)`,
    detail: valid.map((s: any) => s.title).join("; "),
  });
  return { created };
}

export async function executeAiSuggestion(id: number): Promise<{ success: boolean; message: string }> {
  const suggestion = await getAiSuggestionById(id);
  if (!suggestion) return { success: false, message: "Suggestion not found." };
  if (suggestion.status !== "pending" && suggestion.status !== "approved") {
    return { success: false, message: `Already ${suggestion.status}.` };
  }

  try {
    const message = await runAction(suggestion);
    await updateAiSuggestion(id, { status: "executed", resultMessage: message, resolvedAt: new Date() });
    await logActivity({ module: suggestion.module, level: "success", title: `AI suggestion approved: ${suggestion.title}`, detail: message });
    return { success: true, message };
  } catch (err: any) {
    const message = err?.message || "Action failed.";
    await updateAiSuggestion(id, { status: "failed", resultMessage: message, resolvedAt: new Date() });
    await logActivity({ module: suggestion.module, level: "error", title: `AI suggestion failed: ${suggestion.title}`, detail: message });
    return { success: false, message };
  }
}

async function runAction(suggestion: AiSuggestion): Promise<string> {
  const actionType = suggestion.actionType as ActionType;
  const payload = (suggestion.actionPayload as any) ?? {};

  switch (actionType) {
    case "run_site_audit": {
      const result = await runFullAudit();
      return `Site audit complete — score ${result.overallScore}, ${result.issueCount} issue(s) found.`;
    }
    case "apply_audit_fixes": {
      const runId = payload.runId ?? (await getLatestAuditRun())?.id;
      if (!runId) throw new Error("No audit run to apply fixes to.");
      const result = await applyAllAuditFixes(runId);
      return `Applied ${result.fixed} fix(es), ${result.skipped} skipped, ${result.failed} failed.`;
    }
    case "run_inventory_scan": {
      const result = await runInventoryScan();
      return `Scanned ${result.scanned} product(s) — ${result.outOfStockCount} out of stock.`;
    }
    case "run_fulfillment": {
      const result = await runAutoFulfillment();
      if (result.lockedOut) return "A fulfillment run was already in progress — didn't start a second one.";
      return `Placed ${result.ordersPlaced}, shipped ${result.ordersShipped}, routed ${result.ordersRoutedToDsers} to DSers.`;
    }
    case "optimize_ad_budgets": {
      const result = await optimizeActiveCampaignBudgets();
      return `Optimized ${result.optimized} of ${result.total} active campaign(s).`;
    }
    case "generate_blog_post": {
      const topic = typeof payload.topic === "string" && payload.topic.trim() ? payload.topic : "home decor trends";
      const aiResp = await invokeLLM({
        messages: [
          { role: "system", content: "You are an expert content marketer for a premium home decor brand." },
          {
            role: "user",
            content: `Write a complete SEO-optimized blog post about "${topic}" for a home decor e-commerce store. Return JSON: { title, metaTitle (max 60 chars), metaDescription (max 160 chars), content (HTML), tags (array of strings), excerpt }`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "post",
            strict: true,
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                metaTitle: { type: "string" },
                metaDescription: { type: "string" },
                content: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                excerpt: { type: "string" },
              },
              required: ["title", "metaTitle", "metaDescription", "content", "tags", "excerpt"],
              additionalProperties: false,
            },
          },
        },
      });
      const raw = aiResp.choices[0].message.content;
      const post = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
      const { postId, published } = await createAndPublishBlogPost(
        { title: post.title, content: post.content, excerpt: post.excerpt, seoTitle: post.metaTitle, seoDescription: post.metaDescription, tags: post.tags },
        true
      );
      return published ? `Published "${post.title}" (post #${postId}).` : `Saved "${post.title}" as a draft (post #${postId}) — publish failed or wasn't attempted.`;
    }
    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }
}
