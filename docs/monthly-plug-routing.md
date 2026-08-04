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

1. **Tag the catalog.** The most reliable rule is the Shopify product `vendor`
   field — set it to `Monthly Plug` on the migrated CSV catalog. A SKU prefix
   (e.g. `MP-`) works equally well if the CSV already carries one.
2. **Stand up an intake endpoint** on the Monthly Plug side (see the contract
   below).
3. **Configure** via the `orderRouting.saveConfig` tRPC endpoint: `webhookUrl`,
   `signingSecret` (any strong random string, shared with the receiver), and
   `rules.vendors` / `rules.skuPrefixes` / `rules.productIds`.
4. **Dry-run** with `orderRouting.preview`. It classifies the live order list
   and returns per-verdict counts, forwarding nothing. Confirm the numbers look
   right before step 5.
5. **Enable** with `saveConfig({ enabled: true })`. This is refused unless a
   webhook URL, a signing secret, and at least one rule are all present.

Routing is seeded **disabled**, so nothing is forwarded until you do this.

### Optional: restrict to specific channels

`rules.channels` takes Shopify `source_name` values (e.g. `["ebay"]`). Left
empty — the default — any channel matches. That is deliberate: a Monthly Plug
product is unfulfillable here no matter which channel sold it, so a direct
storefront sale should route too.

## Webhook contract

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

## What this does not touch

The original Monthly Plug command center's own order feed. This module only
forwards orders that arrived *here*, so residual organic sales still flowing
into Monthly Plug directly are unaffected.
