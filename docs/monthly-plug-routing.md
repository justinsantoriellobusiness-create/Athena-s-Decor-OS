# Monthly Plug order routing

Monthly Plug (head shop / wigs, supplied by DHgate) listings were migrated by
CSV into the Athena's Decor eBay store after the original Monthly Plug eBay
account lost promotion privileges. Those orders land in this Shopify backend,
which has no DHgate integration — so before this feature the fulfillment loop
tagged every one `athena-skip-fulfill` and paged the owner.

This routes them out instead: whole Monthly Plug orders are forwarded to the
Monthly Plug command center over a signed webhook, and Athena's Decor orders
carry on down the normal CJ/DSers path untouched.

## How an order is classified

Per order, against the line items already on the Shopify payload (no extra API
calls, no model call):

| Verdict | When | What happens |
|---|---|---|
| `monthly_plug` | every line item matches a rule | forwarded, tagged `monthly-plug-routed` |
| `athena` | no line item matches | normal fulfillment, untouched |
| `mixed` | both brands in one order | tagged `monthly-plug-split`, owner notified — **not** auto-split |
| `empty` | no line items | ignored |

A line item is Monthly Plug if **any** rule matches: `vendor` (case-insensitive
exact), `sku` prefix (case-insensitive), or an explicit Shopify product ID.

Mixed orders are deliberately not split. The two brands fulfill from different
suppliers, so a partial handoff would either double-ship or strand half the
order. A human decides.

## Setup

Routing is seeded **disabled** and forwards nothing until every step below is
done.

### Step 1 — find out what the catalog calls itself

**Do not guess the vendor string.** Call `orderRouting.listVendors`. It returns
every distinct vendor in the Shopify catalog with a product count and sample
SKU prefixes:

```jsonc
{ "totalProducts": 412, "vendors": [
  { "vendor": "Athena's Decor", "productCount": 265, "skuPrefixes": ["AD-"] },
  { "vendor": "Monthly Plug",   "productCount": 143, "skuPrefixes": ["MP-"] },
  { "vendor": "(no vendor set)", "productCount": 4,  "skuPrefixes": [] }
]}
```

The counts are the check: if "Monthly Plug" shows 143 products and you migrated
~143, the vendor field is set correctly and one rule covers the catalog.

### Step 2 — fix the tagging if it's wrong

Whatever `listVendors` shows is what you have to match. Three cases:

- **Vendor is already set consistently** (e.g. `Monthly Plug` on all of them) —
  nothing to do. Use `rules.vendors: ["Monthly Plug"]`.
- **Vendor is blank or wrong**, but SKUs carry a prefix — use
  `rules.skuPrefixes: ["MP-"]`. Equally reliable, no catalog edit needed.
- **Neither is consistent** — fix it at the source. In Shopify admin: Products →
  filter to the migrated set → select all → **Bulk edit** → add the *Vendor*
  column → set `Monthly Plug` → Save. Re-run `listVendors` to confirm the count.
  Re-importing the original CSV with a `Vendor` column set also works.

Prefer vendor over SKU prefix when you have the choice: it's a single field
Shopify shows in the admin UI, so it's easier to audit later.

You are tagging **products**, not orders. Orders inherit `vendor` and `sku` from
their line items automatically, which is why no per-order work is ever needed.

### Step 3 — stand up the receiving end

Already built: `POST /api/webhooks/athena` in the Monthly-Plug-OS repo
(`server/webhooks.ts`). Set `ATHENA_WEBHOOK_SECRET` there to a strong random
string — the same value you'll use in step 4.

### Step 4 — configure

**Already done for production.** The transport half is set from Railway, so the
shared secret never has to be pasted into a form:

| Service | Variable |
|---|---|
| Monthly-Plug-OS | `ATHENA_WEBHOOK_SECRET` |
| Athena-s-Decor-OS | `MONTHLY_PLUG_WEBHOOK_SECRET` (same value), `MONTHLY_PLUG_WEBHOOK_URL` |

`getOrderRoutingConfig()` falls back to those env vars when nothing is saved in
the DB. A value saved through `orderRouting.saveConfig` still takes precedence,
so the UI path keeps working.

**Still required:** the matching rule from step 2 —
`saveConfig({ rules: { vendors: ["..."] } })`. There is no env fallback for
rules on purpose: a wrong rule silently misroutes real orders, so it has to be
set deliberately and checked with `preview` first.

### Step 5 — dry-run before arming

Call `orderRouting.preview`. It classifies the **live** order list and returns
per-verdict counts, forwarding nothing:

```jsonc
{ "enabled": false, "counts": { "athena": 18, "monthly_plug": 6, "mixed": 1 } }
```

Sanity-check those numbers against what you know is in the queue. If
`monthly_plug` is 0, your rule doesn't match — go back to step 1. If `athena` is
0, your rule is too broad and would forward everything.

### Step 6 — enable

`saveConfig({ enabled: true })`. Refused unless a webhook URL, a signing secret,
and at least one rule are all present.

### Optional: restrict to specific channels

`rules.channels` takes Shopify `source_name` values (e.g. `["ebay"]`). Left
empty — the default — any channel matches. That is deliberate: a Monthly Plug
product is unfulfillable here no matter which channel sold it, so a direct
storefront sale should route too.

## Webhook contract

Implemented by `POST /api/webhooks/athena` in the Monthly-Plug-OS repo. Documented
here because this end defines it.

`POST` to your `webhookUrl`:

```
content-type: application/json
x-athena-signature:       <hex HMAC-SHA256 of the raw body, keyed by signingSecret>
x-athena-idempotency-key: athena-shopify-<shopifyOrderId>
```

```jsonc
{
  "idempotencyKey": "athena-shopify-5521308",
  "source": "athenas-decor-os",
  "brand": "monthly-plug",
  "order": {
    "shopifyOrderId": "5521308",
    "orderNumber": 1042,
    "channel": "ebay",
    "createdAt": "2026-08-04T10:02:11-04:00",
    "currency": "USD",
    "totalPrice": "38.50",
    "email": "buyer@example.com",
    "phone": "+15551234567",
    "shippingAddress": { /* Shopify shipping_address verbatim */ },
    "lineItems": [
      { "productId": "88213", "variantId": "44120", "sku": "MP-BONG-01",
        "title": "…", "vendor": "Monthly Plug", "quantity": 1, "price": "38.50" }
    ]
  }
}
```

The receiver **must**:

- Recompute the HMAC over the raw body and compare in constant time. The
  payload carries customer PII — an unauthenticated endpoint is an open relay
  for forged orders. `verifySignature()` in `server/orderRouting.ts` is the
  reference implementation.
- Dedupe on `idempotencyKey`. Retries and a re-run after a tagging failure can
  both redeliver the same order.
- Return `2xx` on success. `4xx` (except `429`) is treated as a permanent
  rejection and is not retried; `5xx`, `429`, and network errors retry 3× with
  backoff, then tag the order `monthly-plug-failed` and retry again next run.

## Order tags

| Tag | Meaning |
|---|---|
| `monthly-plug-routed` | handed off successfully; idempotency guard |
| `monthly-plug-split` | mixed-brand order, needs manual handling |
| `monthly-plug-failed` | handoff failed; retried on later runs, cleared on success |

## What happens on the Monthly Plug side

The intake records the order and writes a `fulfillment_orders` row carrying the
real shipping address, so it shows up in the Monthly Plug fulfillment queue.

**It is not auto-purchased.** DHGate has no buyer-side purchase API — their Open
Platform covers seller-side order sync and tracking upload only — so someone
still places the DHGate order by hand. Routing gets the order in front of the
right system with the right data; it does not make DHGate fulfillment autonomous.

## What this does not touch

The original Monthly Plug command center's own order feed. This module only
forwards orders that arrived *here*, so residual organic sales still flowing
into Monthly Plug directly are unaffected.
