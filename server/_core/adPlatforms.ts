/**
 * Real ad-platform campaign creation (Facebook/Meta Marketing API, TikTok
 * Marketing API). Uses the access token + account ID collected via the
 * Integrations page.
 *
 * Safety: every campaign is created PAUSED, never live. Actually spending
 * money is left as a manual step in the platform's own ads manager — this
 * code will never activate a campaign on its own.
 *
 * Google Ads is intentionally not implemented here: the current "google"
 * integration is Analytics/Search Console (read-only reporting), not Google
 * Ads. Posting real Google Ads campaigns requires a separate Google Ads API
 * developer token, which only the account owner can apply for (a business
 * review process, not just an API key) — build this once that's in hand.
 */

export type PublishCampaignInput = {
  name: string;
  objective: string;
  dailyBudget: number;
};

export type PublishCampaignResult =
  | { success: true; platformCampaignId: string }
  | { success: false; error: string };

const FACEBOOK_OBJECTIVE_MAP: Record<string, string> = {
  awareness: "OUTCOME_AWARENESS",
  traffic: "OUTCOME_TRAFFIC",
  engagement: "OUTCOME_ENGAGEMENT",
  leads: "OUTCOME_LEADS",
  sales: "OUTCOME_SALES",
  conversions: "OUTCOME_SALES",
  app_promotion: "OUTCOME_APP_PROMOTION",
};

export async function publishFacebookCampaign(
  credentials: { accessToken: string; adAccountId: string },
  input: PublishCampaignInput,
): Promise<PublishCampaignResult> {
  const adAccountId = credentials.adAccountId.startsWith("act_")
    ? credentials.adAccountId
    : `act_${credentials.adAccountId}`;
  const objective = FACEBOOK_OBJECTIVE_MAP[input.objective.toLowerCase()] || "OUTCOME_TRAFFIC";

  const url = new URL(`https://graph.facebook.com/v19.0/${adAccountId}/campaigns`);
  const body = new URLSearchParams({
    name: input.name,
    objective,
    status: "PAUSED",
    special_ad_categories: "[]",
    access_token: credentials.accessToken,
  });

  const res = await fetch(url, { method: "POST", body });
  const data = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };

  if (!res.ok || !data.id) {
    return { success: false, error: data.error?.message || `Facebook API error (${res.status})` };
  }
  return { success: true, platformCampaignId: data.id };
}

const TIKTOK_OBJECTIVE_MAP: Record<string, string> = {
  awareness: "REACH",
  traffic: "TRAFFIC",
  engagement: "ENGAGEMENT",
  leads: "LEAD_GENERATION",
  sales: "PRODUCT_SALES",
  conversions: "CONVERSIONS",
  app_promotion: "APP_PROMOTION",
};

export async function publishTikTokCampaign(
  credentials: { accessToken: string; advertiserId: string },
  input: PublishCampaignInput,
): Promise<PublishCampaignResult> {
  const objectiveType = TIKTOK_OBJECTIVE_MAP[input.objective.toLowerCase()] || "TRAFFIC";

  const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/campaign/create/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "access-token": credentials.accessToken,
    },
    body: JSON.stringify({
      advertiser_id: credentials.advertiserId,
      campaign_name: input.name,
      objective_type: objectiveType,
      budget_mode: "BUDGET_MODE_DAY",
      budget: input.dailyBudget,
      operation_status: "DISABLE", // created paused
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    code?: number;
    message?: string;
    data?: { campaign_id?: string };
  };

  if (!res.ok || data.code !== 0 || !data.data?.campaign_id) {
    return { success: false, error: data.message || `TikTok API error (${res.status})` };
  }
  return { success: true, platformCampaignId: data.data.campaign_id };
}
