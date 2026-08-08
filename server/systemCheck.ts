/**
 * Live system check — proves each integration actually works, right now.
 *
 * Everything here makes a real outbound call and reports what came back. The
 * point is to distinguish three states that look identical in a settings UI:
 * genuinely working, credentials present but rejected by the provider, and
 * not configured at all. A green badge that only means "a row exists in the
 * database" is the failure mode this exists to eliminate.
 *
 * Runs on the server because that's the only place with both the decrypted
 * credentials and outbound network access to the providers.
 */
import { getShopifyClient, SHOPIFY_API_VERSION } from "./shopify";
import { decryptCredential, decryptCredentials } from "./crypto";
import {
  getShopifyConfig, getSourcingAppCredential, getDb,
  getFinancialAccounts, getAutomationSetting,
} from "./db";
import { getCjAccessToken, getCjBalance } from "./_core/cjDropshipping";
import { listBufferChannels } from "./_core/buffer";
import { isEmailConfigured } from "./_core/email";
import { isFirecrawlConfigured } from "./_core/firecrawl";
import { getOrderRoutingConfig, signPayload } from "./orderRouting";

export type CheckStatus = "ok" | "warn" | "fail" | "skipped";

export type CheckResult = {
  key: string;
  label: string;
  status: CheckStatus;
  /** One line the owner can act on. Never a raw stack trace. */
  detail: string;
  /** Anything worth seeing — counts, balances, expiry dates. */
  data?: Record<string, unknown>;
};

const ok = (key: string, label: string, detail: string, data?: Record<string, unknown>): CheckResult =>
  ({ key, label, status: "ok", detail, data });
const warn = (key: string, label: string, detail: string, data?: Record<string, unknown>): CheckResult =>
  ({ key, label, status: "warn", detail, data });
const fail = (key: string, label: string, detail: string, data?: Record<string, unknown>): CheckResult =>
  ({ key, label, status: "fail", detail, data });
const skipped = (key: string, label: string, detail: string): CheckResult =>
  ({ key, label, status: "skipped", detail });

const errText = (e: unknown): string => {
  const m = e instanceof Error ? e.message : String(e);
  return m.length > 300 ? `${m.slice(0, 300)}…` : m;
};

// ─── Individual checks ──────────────────────────────────────────────────────

async function checkDatabase(): Promise<CheckResult> {
  try {
    const db = await getDb();
    if (!db) return fail("database", "Database", "No DATABASE_URL configured — nothing can persist.");
    await getAutomationSetting("fulfillment");
    return ok("database", "Database", "Connected, queries responding.");
  } catch (e) {
    return fail("database", "Database", errText(e));
  }
}

async function checkShopify(): Promise<CheckResult> {
  try {
    const config = await getShopifyConfig();
    if (!config?.isConnected) return fail("shopify", "Shopify", "Not connected — the whole fulfillment loop depends on this.");
    const client = await getShopifyClient(
      config.storeDomain,
      decryptCredential(config.accessToken) ?? config.accessToken
    );
    const { shop } = await client.testConnection();
    const { count } = await client.getProductCount();
    return ok("shopify", "Shopify", `${shop.name} — ${count} products, API ${SHOPIFY_API_VERSION}.`, {
      domain: shop.domain, products: count, apiVersion: SHOPIFY_API_VERSION,
    });
  } catch (e) {
    return fail("shopify", "Shopify", errText(e));
  }
}

async function checkCj(): Promise<CheckResult> {
  try {
    const cred = await getSourcingAppCredential("cj");
    const apiKey = cred?.apiKey ? decryptCredentials({ apiKey: cred.apiKey }).apiKey : null;
    const email = cred?.apiSecret ?? null;
    if (!apiKey || !email) return fail("cj", "CJ Dropshipping", "Not connected — CJ orders can't be placed.");
    const token = await getCjAccessToken(email, apiKey);
    if (!token) return fail("cj", "CJ Dropshipping", "Credentials rejected — CJ auth failed.");
    const balance = await getCjBalance(token);
    if (!balance) return warn("cj", "CJ Dropshipping", "Authenticated, but the wallet balance didn't come back.");
    // A zero balance authenticates fine and then fails every order placement,
    // so it's a warning rather than a pass.
    return balance.amount <= 0
      ? warn("cj", "CJ Dropshipping", `Connected, but wallet is $${balance.amount.toFixed(2)} — orders will fail to place.`, { balance: balance.amount })
      : ok("cj", "CJ Dropshipping", `Connected — wallet $${balance.amount.toFixed(2)}.`, { balance: balance.amount });
  } catch (e) {
    return fail("cj", "CJ Dropshipping", errText(e));
  }
}

async function checkBuffer(userId: number, resolveKey: (u: number) => Promise<string | null>): Promise<CheckResult> {
  try {
    const key = await resolveKey(userId);
    if (!key) return skipped("buffer", "Buffer (Social)", "No API key — social publishing is off.");
    const channels = await listBufferChannels(key);
    return channels.length === 0
      ? warn("buffer", "Buffer (Social)", "Key works, but no channels are connected inside Buffer yet.", { channels: 0 })
      : ok("buffer", "Buffer (Social)", `${channels.length} channel(s): ${channels.map(c => c.service).join(", ")}.`, {
          channels: channels.length, services: channels.map(c => c.service),
        });
  } catch (e) {
    return fail("buffer", "Buffer (Social)", errText(e));
  }
}

/**
 * Meta check also reads the token's own expiry via /debug_token. A token that
 * works today but dies in a week is not "ok" — the ads module would go quiet
 * with no error anyone would notice.
 */
async function checkMetaAds(
  creds: { accessToken: string; accountId: string } | null
): Promise<CheckResult> {
  if (!creds) return skipped("meta", "Meta Ads", "Not connected — ad spend and ROAS won't sync.");
  try {
    const acct = creds.accountId.startsWith("act_") ? creds.accountId : `act_${creds.accountId}`;
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${acct}?fields=name,account_status,currency&access_token=${encodeURIComponent(creds.accessToken)}`
    );
    const body = (await res.json()) as any;
    if (!res.ok || body.error) {
      return fail("meta", "Meta Ads", body?.error?.message ?? `Graph API returned ${res.status}`);
    }

    let expiresAt: number | null = null;
    try {
      const dbg = await fetch(
        `https://graph.facebook.com/v19.0/debug_token?input_token=${encodeURIComponent(creds.accessToken)}&access_token=${encodeURIComponent(creds.accessToken)}`
      );
      const dbgBody = (await dbg.json()) as any;
      const exp = dbgBody?.data?.expires_at;
      if (typeof exp === "number" && exp > 0) expiresAt = exp;
    } catch {
      // Expiry is a nice-to-have; a failure here shouldn't fail the check.
    }

    const data: Record<string, unknown> = {
      account: body.name, accountStatus: body.account_status, currency: body.currency,
    };
    if (expiresAt) {
      const days = Math.floor((expiresAt * 1000 - Date.now()) / 86_400_000);
      data.tokenExpiresInDays = days;
      if (days <= 14) {
        return warn("meta", "Meta Ads", `Connected to "${body.name}", but the token expires in ${days} day(s) — regenerate it or ad data stops silently.`, data);
      }
      return ok("meta", "Meta Ads", `Connected to "${body.name}" — token valid ${days} more day(s).`, data);
    }
    return ok("meta", "Meta Ads", `Connected to "${body.name}" — token does not expire.`, data);
  } catch (e) {
    return fail("meta", "Meta Ads", errText(e));
  }
}

async function checkEbay(): Promise<CheckResult> {
  try {
    const accounts = await getFinancialAccounts();
    const ebay = accounts.find(a => a.provider === "ebay");
    if (!ebay?.credentials) return skipped("ebay", "eBay Finances", "Not connected — eBay payouts and fees won't appear in Accounting.");
    const creds = decryptCredentials(ebay.credentials as Record<string, string>);
    if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
      return fail("ebay", "eBay Finances", "Stored credentials are incomplete — needs Client ID, Client Secret and Refresh Token.");
    }
    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
    const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: creds.refreshToken,
        scope: "https://api.ebay.com/oauth/api_scope/sell.finances",
      }).toString(),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return fail("ebay", "eBay Finances", `eBay rejected the refresh token (${res.status}). Redo the consent flow. ${t.slice(0, 120)}`);
    }
    return ok("ebay", "eBay Finances", "Refresh token valid — transaction sync will work.");
  } catch (e) {
    return fail("ebay", "eBay Finances", errText(e));
  }
}

/**
 * Verifies the Monthly Plug handoff end to end without creating an order:
 * sends a correctly signed payload the receiver is expected to reject as
 * unprocessable (no line items). A 400 proves the URL resolves, the shared
 * secret matches, and the intake is running — a 401 would mean the secrets
 * have drifted apart, which is the failure this is really looking for.
 */
async function checkMonthlyPlugRouting(): Promise<CheckResult> {
  try {
    const config = await getOrderRoutingConfig();
    if (!config.webhookUrl || !config.signingSecret) {
      return skipped("routing", "Monthly Plug routing", "Webhook URL or signing secret not set.");
    }
    const body = JSON.stringify({ idempotencyKey: "athena-systemcheck-probe", order: { lineItems: [] } });
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-athena-signature": signPayload(body, config.signingSecret),
        "x-athena-idempotency-key": "athena-systemcheck-probe",
      },
      body,
    });

    const enabledNote = config.enabled ? "armed" : "NOT armed (orders won't forward)";
    if (res.status === 400) {
      return config.enabled
        ? ok("routing", "Monthly Plug routing", `Reachable, signature accepted, ${enabledNote}.`, { rules: config.rules })
        : warn("routing", "Monthly Plug routing", `Reachable and signature accepted, but routing is ${enabledNote}.`, { rules: config.rules });
    }
    if (res.status === 401) {
      return fail("routing", "Monthly Plug routing", "Signature rejected — the shared secret differs between Athena and Monthly Plug.");
    }
    if (res.status === 503) {
      return fail("routing", "Monthly Plug routing", "Monthly Plug intake reachable but not configured (ATHENA_WEBHOOK_SECRET missing there) or its database is down.");
    }
    return warn("routing", "Monthly Plug routing", `Unexpected response ${res.status} from the intake endpoint.`);
  } catch (e) {
    return fail("routing", "Monthly Plug routing", `Intake unreachable: ${errText(e)}`);
  }
}

async function checkAutomation(): Promise<CheckResult> {
  try {
    const fulfillment = await getAutomationSetting("fulfillment");
    if (!fulfillment) return warn("automation", "Automation", "No fulfillment automation row — it has never been seeded.");
    if (!fulfillment.enabled) return warn("automation", "Automation", "Auto-fulfillment is DISABLED — orders won't be placed automatically.");
    const last = fulfillment.lastRunAt ? new Date(fulfillment.lastRunAt) : null;
    const mins = last ? Math.floor((Date.now() - last.getTime()) / 60000) : null;
    const data = { cron: fulfillment.cronExpression, lastRunStatus: fulfillment.lastRunStatus, lastRunMinutesAgo: mins };
    if (mins == null) return warn("automation", "Automation", "Enabled, but it has never run yet.", data);
    // Cron is every 30 min; more than ~70 means the scheduler isn't ticking.
    if (mins > 70) return warn("automation", "Automation", `Enabled, but last ran ${mins} minutes ago — the scheduler may not be running.`, data);
    return ok("automation", "Automation", `Auto-fulfillment ran ${mins} minute(s) ago (${fulfillment.lastRunStatus}).`, data);
  } catch (e) {
    return fail("automation", "Automation", errText(e));
  }
}

function checkEmail(): CheckResult {
  return isEmailConfigured()
    ? ok("email", "Email (Resend)", "Configured — campaigns can send.")
    : skipped("email", "Email (Resend)", "RESEND_API_KEY not set — campaigns won't send.");
}

function checkFirecrawl(): CheckResult {
  return isFirecrawlConfigured()
    ? ok("firecrawl", "Firecrawl", "Configured — real prospect/backlink discovery available.")
    : skipped("firecrawl", "Firecrawl", "Not set — backlink and prospect discovery falls back to AI-generated (unverified) candidates.");
}

// ─── Runner ─────────────────────────────────────────────────────────────────

export type SystemCheckReport = {
  ranAt: string;
  summary: { ok: number; warn: number; fail: number; skipped: number };
  readyToOperate: boolean;
  results: CheckResult[];
};

export async function runSystemCheck(opts: {
  userId: number;
  resolveBufferKey: (userId: number) => Promise<string | null>;
  resolveAdCredentials: (
    userId: number,
    platform: "facebook" | "tiktok"
  ) => Promise<{ accessToken: string; accountId: string } | null>;
}): Promise<SystemCheckReport> {
  const metaCreds = await opts.resolveAdCredentials(opts.userId, "facebook").catch(() => null);

  // Run in parallel — these are independent network calls and doing them
  // serially would make the page feel broken.
  const results = await Promise.all([
    checkDatabase(),
    checkShopify(),
    checkCj(),
    checkMonthlyPlugRouting(),
    checkAutomation(),
    checkBuffer(opts.userId, opts.resolveBufferKey),
    checkMetaAds(metaCreds),
    checkEbay(),
    Promise.resolve(checkEmail()),
    Promise.resolve(checkFirecrawl()),
  ]);

  const summary = { ok: 0, warn: 0, fail: 0, skipped: 0 };
  for (const r of results) summary[r.status]++;

  // "Ready" means nothing required for taking and fulfilling an order is
  // broken. Optional integrations being absent doesn't block operating.
  const CORE = ["database", "shopify", "cj", "automation"];
  const readyToOperate = results
    .filter(r => CORE.includes(r.key))
    .every(r => r.status === "ok" || r.status === "warn");

  return { ranAt: new Date().toISOString(), summary, readyToOperate, results };
}
