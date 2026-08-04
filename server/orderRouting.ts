/**
 * Cross-brand order routing: Monthly Plug orders arriving in Athena's Decor.
 *
 * Why this exists: the Monthly Plug catalog (head shop / wigs, supplied by
 * DHgate) was migrated by CSV into the Athena's Decor eBay store after the
 * original Monthly Plug eBay account lost promotion privileges. Those orders
 * now land in this Shopify backend, which has no DHgate integration — so the
 * fulfillment loop can't act on them and was tagging every one
 * `athena-skip-fulfill` and paging the owner.
 *
 * What this does instead: classify each order by which brand its line items
 * belong to, forward whole Monthly Plug orders to the Monthly Plug command
 * center over a signed webhook, and let Athena's Decor orders continue down
 * the normal CJ/DSers path untouched.
 *
 * Deliberately NOT filtered to eBay-only orders. The trigger for the migration
 * was eBay, but a Monthly Plug product is unfulfillable here no matter which
 * channel sold it — if one sells through the Shopify storefront directly it
 * needs the same treatment. Set `channels` in the config to narrow this to
 * specific Shopify `source_name` values if that turns out to be wrong.
 *
 * This module never touches the original Monthly Plug command center's own
 * order feed. It only forwards orders that arrived *here*, so residual organic
 * sales still flowing into Monthly Plug directly are unaffected — and the
 * `monthly-plug-routed` tag plus the receiver's own idempotency key make a
 * double-send safe if this runs twice on the same order.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { getAutomationSetting, updateAutomationSetting, logActivity } from "./db";
import { encryptCredential, decryptCredential } from "./crypto";

export const ROUTING_MODULE = "order_routing";

/** Applied to orders successfully handed off. Also the idempotency guard. */
export const MONTHLY_PLUG_ROUTED_TAG = "monthly-plug-routed";
/** Applied to orders containing BOTH brands — these need a human. */
export const MONTHLY_PLUG_SPLIT_TAG = "monthly-plug-split";
/** Applied when a handoff failed repeatedly, so it's visible in the Orders UI. */
export const MONTHLY_PLUG_FAILED_TAG = "monthly-plug-failed";

export type OrderRoutingRules = {
  /** Shopify line-item `vendor` values owned by Monthly Plug. Case-insensitive. */
  vendors: string[];
  /** SKU prefixes, e.g. "MP-". Case-insensitive. */
  skuPrefixes: string[];
  /** Explicit Shopify product IDs, as an escape hatch for one-offs. */
  productIds: string[];
  /**
   * Optional allowlist of Shopify `source_name` values (e.g. "ebay"). Empty
   * means "any channel" — see the note in the module header.
   */
  channels: string[];
};

export type OrderRoutingConfig = {
  enabled: boolean;
  /** Monthly Plug command center intake endpoint. */
  webhookUrl: string;
  /** Shared secret for the HMAC signature. Stored encrypted at rest. */
  signingSecret: string;
  rules: OrderRoutingRules;
};

export const EMPTY_RULES: OrderRoutingRules = {
  vendors: [],
  skuPrefixes: [],
  productIds: [],
  channels: [],
};

const DEFAULT_CONFIG: OrderRoutingConfig = {
  enabled: false,
  webhookUrl: "",
  signingSecret: "",
  rules: EMPTY_RULES,
};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];

/**
 * Reads config from the `order_routing` automationSettings row. That row is
 * seeded with a null cronExpression so the internal scheduler skips it — this
 * module is driven by the fulfillment loop, not by its own cron tick.
 */
export async function getOrderRoutingConfig(): Promise<OrderRoutingConfig> {
  const setting = await getAutomationSetting(ROUTING_MODULE);
  if (!setting) return DEFAULT_CONFIG;
  const raw = (setting.config as Record<string, unknown> | null) ?? {};
  const rules = (raw.rules as Record<string, unknown> | undefined) ?? {};
  const storedSecret = typeof raw.signingSecret === "string" ? raw.signingSecret : "";
  return {
    enabled: setting.enabled === true,
    webhookUrl: typeof raw.webhookUrl === "string" ? raw.webhookUrl : "",
    // Tolerate a plaintext secret written before encryption was in place
    // rather than silently routing with an empty secret.
    signingSecret: storedSecret ? (decryptCredential(storedSecret) ?? storedSecret) : "",
    rules: {
      vendors: asStringArray(rules.vendors),
      skuPrefixes: asStringArray(rules.skuPrefixes),
      productIds: asStringArray(rules.productIds),
      channels: asStringArray(rules.channels),
    },
  };
}

export async function saveOrderRoutingConfig(
  update: {
    enabled?: boolean;
    webhookUrl?: string;
    signingSecret?: string;
    /** Partial so a caller can update one rule list without resending the rest. */
    rules?: Partial<OrderRoutingRules>;
  }
): Promise<void> {
  const current = await getOrderRoutingConfig();
  const merged: OrderRoutingConfig = {
    enabled: update.enabled ?? current.enabled,
    webhookUrl: update.webhookUrl ?? current.webhookUrl,
    signingSecret: update.signingSecret ?? current.signingSecret,
    rules: { ...current.rules, ...(update.rules ?? {}) },
  };
  await updateAutomationSetting(ROUTING_MODULE, {
    enabled: merged.enabled,
    config: {
      webhookUrl: merged.webhookUrl,
      signingSecret: merged.signingSecret ? encryptCredential(merged.signingSecret) : "",
      rules: merged.rules,
    },
  } as never);
}

// ─── Classification (pure, local — no model call) ───────────────────────────

export type LineItemLike = {
  product_id?: string | number | null;
  sku?: string | null;
  vendor?: string | null;
  title?: string | null;
  quantity?: number | null;
};

/**
 * True if a single line item belongs to Monthly Plug. Matches on fields that
 * are already present on the Shopify order payload (vendor, sku, product_id),
 * so classifying an order costs no extra API calls.
 */
export function isMonthlyPlugLineItem(li: LineItemLike, rules: OrderRoutingRules): boolean {
  const vendor = (li.vendor ?? "").trim().toLowerCase();
  if (vendor && rules.vendors.some(v => v.trim().toLowerCase() === vendor)) return true;

  const sku = (li.sku ?? "").trim().toLowerCase();
  if (sku && rules.skuPrefixes.some(p => p.trim() && sku.startsWith(p.trim().toLowerCase()))) return true;

  const pid = li.product_id == null ? "" : String(li.product_id);
  if (pid && rules.productIds.includes(pid)) return true;

  return false;
}

export type RoutingVerdict =
  /** Every line item is Monthly Plug — forward the whole order. */
  | "monthly_plug"
  /** No Monthly Plug items — normal Athena's Decor fulfillment. */
  | "athena"
  /** Both brands in one order — cannot be auto-split, needs a human. */
  | "mixed"
  /** Order has no line items to classify. */
  | "empty";

export type Classification = {
  verdict: RoutingVerdict;
  monthlyPlugItems: LineItemLike[];
  athenaItems: LineItemLike[];
};

export function classifyOrder(order: { line_items?: LineItemLike[] | null; source_name?: string | null }, rules: OrderRoutingRules): Classification {
  const lineItems = order.line_items ?? [];
  if (lineItems.length === 0) {
    return { verdict: "empty", monthlyPlugItems: [], athenaItems: [] };
  }

  // Channel allowlist, when set, decides whether this order is even a
  // candidate. An out-of-scope channel is treated as pure Athena so the
  // normal path handles it — never as "mixed", which would page the owner.
  if (rules.channels.length > 0) {
    const source = (order.source_name ?? "").trim().toLowerCase();
    const allowed = rules.channels.some(c => c.trim().toLowerCase() === source);
    if (!allowed) return { verdict: "athena", monthlyPlugItems: [], athenaItems: lineItems };
  }

  const monthlyPlugItems: LineItemLike[] = [];
  const athenaItems: LineItemLike[] = [];
  for (const li of lineItems) {
    (isMonthlyPlugLineItem(li, rules) ? monthlyPlugItems : athenaItems).push(li);
  }

  if (monthlyPlugItems.length === 0) return { verdict: "athena", monthlyPlugItems, athenaItems };
  if (athenaItems.length === 0) return { verdict: "monthly_plug", monthlyPlugItems, athenaItems };
  return { verdict: "mixed", monthlyPlugItems, athenaItems };
}

// ─── Handoff ────────────────────────────────────────────────────────────────

export type MonthlyPlugHandoffPayload = {
  /** Stable idempotency key — the receiver should dedupe on this. */
  idempotencyKey: string;
  source: "athenas-decor-os";
  brand: "monthly-plug";
  order: {
    shopifyOrderId: string;
    orderNumber: string | number | null;
    channel: string | null;
    createdAt: string | null;
    currency: string | null;
    totalPrice: string | null;
    email: string | null;
    phone: string | null;
    shippingAddress: unknown;
    lineItems: Array<{
      productId: string | null;
      variantId: string | null;
      sku: string | null;
      title: string | null;
      vendor: string | null;
      quantity: number;
      price: string | null;
    }>;
  };
};

export function buildHandoffPayload(order: any, items: LineItemLike[]): MonthlyPlugHandoffPayload {
  return {
    idempotencyKey: `athena-shopify-${order.id}`,
    source: "athenas-decor-os",
    brand: "monthly-plug",
    order: {
      shopifyOrderId: String(order.id),
      orderNumber: order.order_number ?? null,
      channel: order.source_name ?? null,
      createdAt: order.created_at ?? null,
      currency: order.currency ?? null,
      totalPrice: order.total_price ?? null,
      email: order.email ?? null,
      phone: order.phone ?? order.shipping_address?.phone ?? null,
      shippingAddress: order.shipping_address ?? null,
      lineItems: items.map((li: any) => ({
        productId: li.product_id == null ? null : String(li.product_id),
        variantId: li.variant_id == null ? null : String(li.variant_id),
        sku: li.sku ?? null,
        title: li.title ?? null,
        vendor: li.vendor ?? null,
        quantity: li.quantity ?? 1,
        price: li.price ?? null,
      })),
    },
  };
}

/**
 * HMAC-SHA256 over the exact JSON body, hex-encoded. The Monthly Plug side
 * recomputes this with the shared secret to prove the order really came from
 * here — the payload carries customer PII, so an unauthenticated intake
 * endpoint would be an open relay for forged orders.
 */
export function signPayload(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/** Constant-time verify, for the receiving end (exported for reuse/tests). */
export function verifySignature(body: string, secret: string, signature: string): boolean {
  const expected = signPayload(body, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature ?? "", "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type HandoffResult = { ok: boolean; status?: number; error?: string };

const HANDOFF_MAX_ATTEMPTS = 3;
const HANDOFF_BASE_DELAY_MS = 500;
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function forwardToMonthlyPlug(
  payload: MonthlyPlugHandoffPayload,
  config: Pick<OrderRoutingConfig, "webhookUrl" | "signingSecret">
): Promise<HandoffResult> {
  if (!config.webhookUrl) return { ok: false, error: "Monthly Plug webhook URL is not configured" };
  if (!config.signingSecret) return { ok: false, error: "Monthly Plug signing secret is not configured" };

  const body = JSON.stringify(payload);
  const signature = signPayload(body, config.signingSecret);

  let lastError = "";
  for (let attempt = 0; attempt < HANDOFF_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(config.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-athena-signature": signature,
          "x-athena-idempotency-key": payload.idempotencyKey,
        },
        body,
      });
      if (res.ok) return { ok: true, status: res.status };
      lastError = `Monthly Plug intake returned ${res.status}`;
      // 4xx other than 429 is a permanent rejection — retrying an
      // already-rejected payload just delays surfacing the real problem.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return { ok: false, status: res.status, error: lastError };
      }
    } catch (err: any) {
      lastError = `Monthly Plug intake unreachable: ${err?.message ?? String(err)}`;
    }
    if (attempt < HANDOFF_MAX_ATTEMPTS - 1) await sleep(HANDOFF_BASE_DELAY_MS * 2 ** attempt);
  }
  return { ok: false, error: lastError };
}

// ─── Fulfillment-loop entry point ───────────────────────────────────────────

export type RoutingOutcome =
  | { action: "not_applicable" }
  | { action: "already_routed" }
  | { action: "routed"; itemCount: number }
  | { action: "needs_manual_split" }
  | { action: "failed"; error: string };

/**
 * Decides and performs the Monthly Plug handoff for one order.
 *
 * Returns `not_applicable` for ordinary Athena's Decor orders, which is the
 * signal for the fulfillment loop to carry on exactly as before. Tagging is
 * delegated to the caller (`applyTags`) so this stays testable without a
 * live Shopify client.
 */
export async function routeOrder(
  order: any,
  config: OrderRoutingConfig,
  applyTags: (orderId: string, tags: string[]) => Promise<unknown>,
  existingTags: string[]
): Promise<RoutingOutcome> {
  if (!config.enabled) return { action: "not_applicable" };

  if (existingTags.includes(MONTHLY_PLUG_ROUTED_TAG)) return { action: "already_routed" };
  // A previously-failed handoff keeps its tag but is retried on later runs —
  // a transient outage at the Monthly Plug end shouldn't strand the order.
  if (existingTags.includes(MONTHLY_PLUG_SPLIT_TAG)) return { action: "needs_manual_split" };

  const { verdict, monthlyPlugItems } = classifyOrder(order, config.rules);
  if (verdict === "athena" || verdict === "empty") return { action: "not_applicable" };

  if (verdict === "mixed") {
    await applyTags(String(order.id), [...existingTags, MONTHLY_PLUG_SPLIT_TAG]);
    await logActivity({
      module: ROUTING_MODULE,
      level: "warning",
      title: `Order #${order.order_number} contains both brands`,
      detail:
        "Mixed Athena's Decor + Monthly Plug order — it can't be auto-split because the two brands fulfill from different suppliers. Fulfil the Athena items here and place the Monthly Plug items manually in Monthly Plug.",
      metadata: { shopifyOrderId: String(order.id) },
    }).catch(() => {});
    return { action: "needs_manual_split" };
  }

  const payload = buildHandoffPayload(order, monthlyPlugItems);
  const result = await forwardToMonthlyPlug(payload, config);

  if (!result.ok) {
    const nextTags = existingTags.includes(MONTHLY_PLUG_FAILED_TAG)
      ? existingTags
      : [...existingTags, MONTHLY_PLUG_FAILED_TAG];
    await applyTags(String(order.id), nextTags).catch(() => {});
    await logActivity({
      module: ROUTING_MODULE,
      level: "error",
      title: `Failed to hand off order #${order.order_number} to Monthly Plug`,
      detail: result.error ?? "Unknown error",
      metadata: { shopifyOrderId: String(order.id) },
    }).catch(() => {});
    return { action: "failed", error: result.error ?? "Unknown error" };
  }

  // Drop the failure tag on a later successful retry so the Orders UI doesn't
  // keep showing a stale error state.
  const cleaned = existingTags.filter(t => t !== MONTHLY_PLUG_FAILED_TAG);
  await applyTags(String(order.id), [...cleaned, MONTHLY_PLUG_ROUTED_TAG]);
  await logActivity({
    module: ROUTING_MODULE,
    level: "success",
    title: `Order #${order.order_number} routed to Monthly Plug`,
    detail: `${monthlyPlugItems.length} item(s) handed off to the Monthly Plug command center for DHgate fulfillment.`,
    metadata: { shopifyOrderId: String(order.id), idempotencyKey: payload.idempotencyKey },
  }).catch(() => {});
  return { action: "routed", itemCount: monthlyPlugItems.length };
}
