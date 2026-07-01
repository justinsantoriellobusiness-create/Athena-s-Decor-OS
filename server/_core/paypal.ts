/**
 * PayPal transaction sync via the REST Transaction Search API.
 * Auth is client_credentials — the account owner creates a PayPal REST API
 * app (developer.paypal.com) for their own business account and enters the
 * Client ID + Secret in Accounting → Accounts. No redirect/consent flow
 * needed since it authenticates as the app owner's own account.
 */
const PAYPAL_API_BASE = "https://api-m.paypal.com";

export type PayPalTransaction = {
  externalId: string;
  date: Date;
  description: string;
  amount: number;
  fee: number;
  eventCode: string;
};

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basicAuth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`PayPal auth failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// PayPal's Transaction Search API caps each request to a 31-day window.
export async function fetchPayPalTransactions(
  credentials: { clientId?: string; clientSecret?: string },
  sinceDate: Date,
): Promise<PayPalTransaction[]> {
  if (!credentials.clientId || !credentials.clientSecret) {
    throw new Error("PayPal account is missing clientId/clientSecret credentials");
  }
  const token = await getAccessToken(credentials.clientId, credentials.clientSecret);

  const endDate = new Date();
  const startDate = new Date(Math.max(sinceDate.getTime(), endDate.getTime() - 30 * 24 * 3600 * 1000));

  const url = new URL(`${PAYPAL_API_BASE}/v1/reporting/transactions`);
  url.searchParams.set("start_date", startDate.toISOString());
  url.searchParams.set("end_date", endDate.toISOString());
  url.searchParams.set("fields", "all");
  url.searchParams.set("page_size", "100");

  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`PayPal transaction search failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { transaction_details?: Array<Record<string, any>> };

  return (data.transaction_details ?? []).map(t => {
    const info = t.transaction_info ?? {};
    return {
      externalId: String(info.transaction_id),
      date: new Date(info.transaction_initiation_date ?? Date.now()),
      description:
        info.transaction_subject || info.transaction_note || `PayPal ${info.transaction_event_code || "transaction"}`,
      amount: parseFloat(info.transaction_amount?.value ?? "0"),
      fee: Math.abs(parseFloat(info.fee_amount?.value ?? "0")),
      eventCode: info.transaction_event_code ?? "unknown",
    };
  });
}
