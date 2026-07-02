/**
 * Shared ad-budget-optimization logic — used by the scheduled ads
 * automation and the AI Assistant's "optimize_ads" quick action.
 */
import { invokeLLM } from "./_core/llm";
import { getAdCampaigns, updateAdCampaign } from "./db";

export async function optimizeActiveCampaignBudgets(): Promise<{ optimized: number; total: number }> {
  const campaigns = await getAdCampaigns();
  const active = campaigns.filter((c: any) => c.status === "active" && c.impressions > 0);
  let optimized = 0;
  for (const campaign of active) {
    try {
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are a performance marketing optimization expert. Return structured JSON only." },
          { role: "user", content: `Analyze this ad campaign and recommend budget optimization:\nCampaign: ${campaign.name}\nPlatform: ${campaign.platform}\nDaily Budget: $${campaign.dailyBudget}\nROAS: ${campaign.roas}\nCTR: ${campaign.ctr}%\nCPC: $${campaign.cpc}\nImpressions: ${campaign.impressions}\nClicks: ${campaign.clicks}\nConversions: ${campaign.conversions}\n\nReturn JSON: { "recommendedDailyBudget": number, "reasoning": string, "actions": string[] }` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "budget_optimization", strict: true, schema: { type: "object", properties: { recommendedDailyBudget: { type: "number" }, reasoning: { type: "string" }, actions: { type: "array", items: { type: "string" } } }, required: ["recommendedDailyBudget", "reasoning", "actions"], additionalProperties: false } } },
      });
      const raw = response.choices[0]?.message?.content;
      const result = JSON.parse(typeof raw === "string" ? raw : "{}");
      await updateAdCampaign(campaign.id, { dailyBudget: result.recommendedDailyBudget, lastOptimizedAt: new Date() });
      optimized++;
    } catch (err: any) {
      console.warn(`[Ads] Budget optimization failed for campaign ${campaign.id}:`, err.message);
    }
  }
  return { optimized, total: active.length };
}
