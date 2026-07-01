/**
 * eBay transaction sync via the Finances API. Auth is a refresh-token grant
 * — eBay's Finances scope requires a one-time interactive consent step that
 * can't be completed by this server alone, so the account owner must:
 *   1. Create a keyset at developer.ebay.com (Client ID + Client Secret)
 *   2. Run eBay's OAuth consent flow once (via their "Get a User Token" tool
 *      or a simple redirect) to obtain a long-lived refresh token
 *   3. Enter clientId / clientSecret / refreshToken in Accounting → Accounts
 * After that, this module mints short-lived access tokens automatically —
 * no further interaction needed for ~18 months until the refresh token expires.
 */
const EBAY_API_BASE = "https://api.ebay.com";
const FINANCES_SCOPE = "https://api.ebay.com/oauth/api_scope/sell.finances";

export type EbayTransaction = {
  externalId: string;
  date: Date;
  description: string;
  amount: number;
  feeAmount: number;
  transactionType: string;
  orderId?: string;
};

async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${EBAY_API_BASE}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basicAuth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: FINANCES_SCOPE,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`eBay auth failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function fetchEbayTransactions(
  credentials: { clientId?: string; clientSecret?: string; refreshToken?: string },
  sinceDate: Date,
): Promise<EbayTransaction[]> {
  if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
    throw new Error("eBay account is missing clientId/clientSecret/refreshToken credentials");
  }
  const token = await getAccessToken(credentials.clientId, credentials.clientSecret, credentials.refreshToken);

  const url = new URL(`${EBAY_API_BASE}/sell/finances/v1/transaction`);
  url.searchParams.set("filter", `transactionDate:[${sinceDate.toISOString()}..]`);
  url.searchParams.set("limit", "100");

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
  });
  if (!res.ok) {
    throw new Error(`eBay Finances API failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { transactions?: Array<Record<string, any>> };

  return (data.transactions ?? []).map(t => ({
    externalId: String(t.transactionId),
    date: new Date(t.transactionDate),
    description: t.transactionMemo || `eBay ${t.transactionType || "transaction"}${t.orderId ? ` #${t.orderId}` : ""}`,
    amount: parseFloat(t.amount?.value ?? "0"),
    feeAmount: Math.abs(parseFloat(t.totalFeeBasisAmount?.value ?? "0")),
    transactionType: t.transactionType ?? "unknown",
    orderId: t.orderId,
  }));
}
