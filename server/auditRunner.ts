/**
 * Shared site-audit logic — used by both the manual `runAudit` tRPC
 * mutation and the autonomous `/api/scheduled/site-audit` route, so the
 * two paths can't drift out of sync.
 */
import { invokeLLM } from "./_core/llm";
import { getShopifyClient } from "./shopify";
import { decryptCredential } from "./crypto";
import { sleep } from "./rateLimiter";
import { withRateLimit } from "./rateLimiter";
import {
  getShopifyConfig,
  createAuditRun,
  updateAuditRun,
  insertAuditIssues,
  getOpenAuditIssues,
  updateAuditIssue,
} from "./db";
import { insertAuditFixLog } from "./optimizerDb";

const AUTO_FIXABLE_TYPES = [
  "missing_alt_text", "missing_meta_description", "missing_meta_title",
  "short_meta_description", "long_meta_description", "short_meta_title", "long_meta_title",
  "missing_title", "thin_content", "poor_description", "low_cro", "weak_cta", "missing_h1", "duplicate_title",
];

export async function runFullAudit(): Promise<{ runId: number; issueCount: number; overallScore: number }> {
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
    return { runId, issueCount: allIssues.length, overallScore };
  } catch (err: any) {
    await updateAuditRun(runId, { status: "error", errorMessage: err.message });
    throw err;
  }
}

export async function applyAllAuditFixes(runId: number): Promise<{ fixed: number; failed: number; total: number }> {
  const config = await getShopifyConfig();
  if (!config?.isConnected) throw new Error("Shopify not connected");

  const allIssues = await getOpenAuditIssues(runId);
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
      await insertAuditFixLog({ auditRunId: runId, issueId: issue.id, pageType: issue.pageType ?? undefined, pageId: issue.pageId ?? undefined, pageTitle: issue.pageTitle ?? undefined, fieldChanged, oldValue: issue.currentValue ?? "", newValue: fixValue, fixType: issue.issueType, status: "applied" });
      await updateAuditIssue(issue.id, { status: "fixed", fixAppliedAt: new Date() });
      fixed++;
      await sleep(600);
    } catch (err: any) {
      console.error(`[Audit] Failed to fix issue ${issue.id}:`, err.message);
      failed++;
    }
  }
  return { fixed, failed, total: fixableIssues.length };
}
