# Athena's Decor OS — Project Status

This file is the durable source of truth for project state. It lives in the
repo (not a chat) so it survives regardless of which chat session is used.
Update it whenever a chat makes a meaningful change or discovers a gap.

## What this is
Shopify dropshipping automation platform, deployed on Railway from GitHub
repo `justinsantoriellobusiness-create/Athena-s-Decor-OS`, branch `main`.
Stack: Express + tRPC + Drizzle ORM (MySQL) backend, React + Vite frontend,
Anthropic Claude for all LLM calls.

## Connected integrations (live, credentials in Railway env vars only)
- **Shopify** — Admin API via OAuth client-credentials (auto-refreshes on
  every boot). Store domain, client ID/secret in Railway Variables.
- **CJ Dropshipping** — API key + account email in Railway Variables.
  Powers real product search and real order placement.
- **DSers** — credentials in Railway Variables. Orders routed to DSers' own
  Shopify sync (DSers has no public order-placement API).
- **eBay** — NOT yet connected, pending user obtaining API credentials.
- **Google/Facebook/TikTok Ads** — NOT connected; ads module only produces
  AI budget *recommendations*, never posts live campaigns (no dev tokens).

## What's actually running in production
- Auto-fulfillment (`server/fulfillmentRunner.ts`, every 30 min): paid
  Shopify orders map to CJ or DSers via `sourced_products` table → CJ
  orders placed for real money from the CJ wallet balance; DSers orders
  tagged for DSers' own sync. Guarded by a DB-backed lock
  (`tryAcquireAutomationLock`/`releaseAutomationLock` in `server/db.ts`) so
  it can never run twice concurrently.
- SEO, Blog, Inventory, Accounting, Shopify sync, Site Audit, Sourcing,
  Email Campaigns/Scraper, Backlinker — all scheduled via
  `server/scheduled.ts` + `server/_core/scheduler.ts` (in-process cron,
  since Manus's Heartbeat isn't available on Railway).
- **Activity Feed** (sidebar → Activity Feed, and a live panel on the
  Dashboard): every automation run above writes a real log entry via
  `logActivity({ module, level, title, detail })` in `server/db.ts` — this
  is the "proof it's working" surface. Check it before believing anything
  ran successfully.
- **Inventory page**: product images, grouped by product with expandable
  variant rows, real CJ supplier stock shown alongside Shopify's own count
  (for verified CJ-sourced products), Republish/Hide controls, a per-variant
  "Set Stock" control that writes directly to Shopify's inventory (same as
  Shopify admin — no separate app needed), a live scan progress bar, and a
  post-scan summary showing exactly what was scanned/hidden/why. Direct link
  to Shopify Admin per product.
- **Sourcing page**: every scraped product tagged Verified (real live CJ
  listing) or AI idea (no live match — DSers/AliExpress have no public
  search API, so those are always AI-generated research ideas, never
  auto-imported/auto-fulfilled off a fake ID).
- **Fulfillment page** (sidebar → Fulfillment): the real-money automation
  finally has its own visibility surface instead of only Activity Feed text.
  Shows every paid Shopify order with its actual state (derived from the
  exact tags `fulfillmentRunner.ts` itself writes — pending / placed with CJ
  / shipped / routed to DSers / stuck in DSers 48h+ / needs manual), the CJ
  wallet balance with a low-balance warning (<$20) since orders silently
  fail to place once that hits $0, and a "Run Fulfillment Now" button that
  calls the same locked, idempotent `runAutoFulfillment()` the 30-min cron
  uses (shares its DB lock, so it can't double-place an order).
- **Accounting auto-COGS**: every real CJ order the fulfillment engine
  places now also writes an expense transaction (`product_cost`, source
  `cj_dropshipping`) into Accounting automatically, estimated from CJ's
  listed price at order time (not the exact invoice — flagged as an
  estimate in the transaction notes). Previously CJ/DSers existed as
  expense categories in Accounting but nothing ever posted to them
  automatically, so real spend was invisible in the P&L unless entered by
  hand. DSers orders are unaffected (DSers manages its own payment/UI, not
  something Athena pays for directly).

## Full code audit — completed
A 15-module line-by-line audit was done and every finding fixed (auth
rate-limiting, Shopify API rate-limit/timeout wrapping + fulfillment
pagination helper, CJ token caching, an open-redirect in email
click-tracking, a naming-mismatch bug that let site-audit "auto-fix"
silently no-op without actually fixing anything, fake CJ/DSers credential
validation that accepted any string as "connected", graceful shutdown on
redeploy, migration-failure-now-halts-boot instead of silently continuing
on a broken schema, and more). Everything is on `main`, passes
`npx tsc --noEmit` with 0 errors and `npm run build` cleanly.

## Known gaps / next candidates (not yet built)
1. **Real supplier-stock sync — CJ only, not yet verified live.** Inventory
   scans now call CJ's `product/stock/queryByVid` for any product mapped to
   a verified CJ listing (`sourced_products.source === "cj" && isVerified`)
   and use that as the real `supplierStock`, overriding Shopify's own stock
   number when the supplier is at 0 (auto-hides the product even if Shopify
   still shows it purchasable). **This has not been confirmed against a live
   CJ account** — the exact response field names were pieced together from
   CJ's docs/community reports (their doc site 403s automated fetches), so
   the code defensively checks several possible field names and treats any
   failure as "unknown" (falls back to Shopify's own count) rather than a
   false "confirmed zero," to avoid wrongly hiding in-stock products. After
   deploy, run "Scan Now" on Inventory and check the Activity Feed entry —
   it states plainly how many variants were checked via live CJ stock
   (`cjChecked`) vs. how many CJ mapping checks failed (`cjUnavailable`). If
   `cjChecked` stays 0 forever despite verified CJ products existing, the
   endpoint/field names need revisiting.
   DSers has no public stock-check API, so DSers-sourced products still only
   use Shopify's own count (unchanged).
2. **CJ wallet balance endpoint also unverified live**, same caveat as
   above — `shopping/pay/getBalance` and its field names were pieced
   together from search results, not confirmed against a live account.
   Fails safe: shows "unavailable" rather than a false $0/low-balance
   alarm if the endpoint details are off. Check the Fulfillment page after
   deploy to confirm a real number shows up.
3. **CJ order cost in Accounting is an estimate**, not the exact CJ
   invoice amount — `createCjOrder`'s response wasn't touched (real-money
   code, left as-is on purpose) so the transaction is built from CJ's
   listed price at order time. Good enough for a live P&L trend, not
   guaranteed penny-accurate; each transaction's notes say so.
4. No automated test coverage for fulfillment/CJ/audit-fix logic beyond
   TypeScript type-checking.
5. Ads platform posting not built (by design, pending dev tokens).
6. eBay integration pending real credentials.
7. No order lookup for orders DSers/CJ don't touch is needed beyond the new
   Fulfillment page — but there's still no full order-search-by-customer
   view; Fulfillment shows the last 100 paid orders only (Shopify API page
   size), not a searchable full history.

## Bugs fixed this round
- `inventory_snapshots` had no unique constraint on `shopifyVariantId`, so
  `upsertInventorySnapshot`'s `onDuplicateKeyUpdate` never actually fired —
  every scan (scheduled, manual, or the AI-assistant `scan_inventory` /
  `inventory` autonomous actions) inserted a brand-new row per variant
  instead of updating the existing one. Migration `0017` dedupes existing
  rows (keeps the newest per variant) and adds the missing unique
  constraint; `upsertInventorySnapshot` now also refreshes all fields
  (image, supplier source, etc.) on conflict, not just a handful. The two
  other inline copies of the scan loop (AI assistant dispatcher) were
  replaced with calls to the shared `runInventoryScan()` so all three scan
  entry points stay in sync and none of them silently overwrite real CJ
  supplier data with a stripped-down Shopify-only write.

## How to work in this repo (for any future chat/agent)
- Check out `main` locally and edit with local file tools; only use the
  GitHub API's single-file update for genuinely small files.
  `server/routers.ts` is ~185KB — editing it via a whole-file API push is
  error-prone; use `git` directly instead.
- Before calling any change done: `npx tsc --noEmit` (0 errors),
  `npm run build` (succeeds), `npx vitest run` (2 pre-existing Zapier tests
  fail on missing env vars in sandboxes — expected, unrelated to any
  change; everything else should pass).
- Migrations: `drizzle-kit generate` works without a live DB connection
  (just needs `DATABASE_URL` set to *any* string to satisfy config
  loading). Applied automatically on boot; a migration failure now halts
  boot rather than silently continuing.
- Railway auto-deploys from `main` on every push.
- Never claim an integration is "connected" or a feature "works" without a
  concrete check (real API call, passing build, live boot log).
- Any new automation must call `logActivity(...)` on both success and
  failure paths — that's how activity becomes visible in the UI.
- Real money moves through CJ order placement
  (`fulfillmentRunner.ts`/`cjDropshipping.ts`) — treat changes there with
  payments-system-level care: idempotency, locking, clear error surfacing.
