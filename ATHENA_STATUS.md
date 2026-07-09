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
- **Inventory page**: product images, grouped by product, Republish
  control (undo an auto-hidden out-of-stock product), direct link to
  Shopify Admin per product.
- **Sourcing page**: every scraped product tagged Verified (real live CJ
  listing) or AI idea (no live match — DSers/AliExpress have no public
  search API, so those are always AI-generated research ideas, never
  auto-imported/auto-fulfilled off a fake ID).

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
1. **No real supplier-stock sync** — CJ/DSers stock isn't checked before
   Shopify shows a product as purchasable; `inventorySnapshots.supplierStock`
   is currently just a copy of Shopify's own stock number. A customer could
   order something the supplier is actually out of. This is the single
   highest-value next fix for fulfillment reliability.
2. No automated test coverage for fulfillment/CJ/audit-fix logic beyond
   TypeScript type-checking.
3. Ads platform posting not built (by design, pending dev tokens).
4. eBay integration pending real credentials.

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
