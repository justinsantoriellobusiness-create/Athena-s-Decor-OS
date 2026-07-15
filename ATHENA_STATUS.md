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
- **CJ Dropshipping** — authenticates via **API Key + Account Email** (2-step
  auth → short-lived access token via `getCjAccessToken()`), entered in
  Sourcing → App Connections. There is no persistent "access token" to
  copy-paste from CJ's dashboard — don't reintroduce a raw-token field.
  Powers real product search, CJ Favorites, real order placement, and (new)
  real supplier stock/wallet-balance checks.
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
  post-scan summary showing exactly what was scanned/hidden/why. Links to
  both Shopify Admin and the live storefront product page. A "How automatic
  out-of-stock works" banner explains that every scan (manual or Auto-Sync)
  already auto-hides out-of-stock products — no separate setup needed.
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

## Round 3 additions
- **CJ low-balance proactive alert**: `runAutoFulfillment()` (every 30 min,
  or manual Run Now) now checks the CJ wallet balance itself and calls
  `notifyOwner()` the moment it drops below `CJ_LOW_BALANCE_THRESHOLD`
  (`shared/const.ts`, currently $20 — shared with the Fulfillment page's UI
  warning so they can't drift). Fires once per dip (tracked via
  `automationSettings.config.cjLowBalanceAlerted`), resets when balance
  recovers, so it doesn't spam every 30 minutes while low.
- **Real sales analytics** (Analytics page, new "Sales Performance" section
  at the top): revenue/orders/AOV for the last 7d and 30d, a daily revenue
  chart, and top products by revenue — pulled live from Shopify orders
  (`analytics.getSalesOverview`), not from automation-activity counts like
  the rest of that page. Also surfaces a real Net Profit figure from
  Accounting's existing `computePL` for the same 30-day window.
- **Email campaign subject-line A/B testing**: optional second subject line
  per campaign (`abTestEnabled`/`variantBSubject` on `email_campaigns`,
  migration `0019`); sending randomly splits the recipient list in half,
  each half gets one subject (body is identical for both — subject-only
  test, by design, to keep this shippable and reliable). Opens/clicks are
  attributed per variant via a `variant` column on `email_events`, carried
  through the tracking pixel/click URLs as a `?v=a|b` query param. Results
  (sent/opened/open rate/clicked per variant, with a trophy on the leader)
  show inline on the campaign card once sent.
- **Email campaigns: real product images**: an "Add Products" picker in the
  campaign composer pulls the live Shopify catalog (`shopify.getProducts`,
  already existed), lets you multi-select, and inserts real product image +
  title + price + storefront-link cards into the HTML body. No invented
  products or fake links — everything comes straight from the connected
  store.

## Round 4 — production-outage root causes + UX fixes
User reported every automation erroring. Two env/credential root causes
found from the Activity Feed errors, plus a page-crash bug:
- **`ANTHROPIC_API_KEY` in Railway is corrupted** — contains a bullet
  character (`•`, code 8226) at position 8, almost certainly pasted from a
  masked field. This crashed EVERY LLM automation (blog, SEO, sourcing,
  email content, audit) with the cryptic "Cannot convert argument to a
  ByteString" error. Code now validates the key upfront (`llm.ts`,
  `imageGeneration.ts` for `OPENAI_API_KEY`, `email.ts` already did
  `RESEND_API_KEY`) and returns an actionable message naming the exact env
  var. **The user must re-paste the real key in Railway — code cannot fix
  a corrupted env var.**
- **Shopify token expiry** — client-credentials tokens live ~24h but were
  only minted at boot (`seed.ts`), so everything 401'd from ~a day after
  the last redeploy (user's feed shows 2:00 AM sync succeeding, 8 AM
  failing). `ShopifyClient` now auto-refreshes on 401 (single-flight),
  persists the fresh token, and retries the request once.
- **Accounting page crashed the whole app** — `<SelectItem value="">` in
  the Transactions tab; Radix Select throws a hard render error on
  empty-string values, and the only ErrorBoundary was app-level. Fixed the
  sentinel value AND added a per-page ErrorBoundary inside AppLayout so a
  page crash can never blank the whole site again.
- **AutoDS removed from all UI** (owner discontinued the account):
  Integrations card, Sourcing connection card, both Push-to-AutoDS buttons.
- **Scheduler**: Enable All / Disable All buttons; presets and labels now
  ET-based ("Daily at 9am ET" converts to the right UTC cron on save);
  raw cron strings ("0 9 * * *") no longer shown anywhere — SEO/Blog/
  Inventory/Ads toggle chips use the shared `client/src/lib/cron.ts` label
  helper.
- **Inventory hidden-product visibility**: new `productStatus` column
  (migration `0020`) tracks Shopify active/draft per product; UI gets a
  "Hidden from Store" stat/filter, a Hidden badge, and Hide/Unhide now
  follows real visibility (previously a hidden in-stock product had no
  unhide button anywhere). Manual hide/republish and the auto-draft path
  all sync the flag immediately.
- **Dashboard refresh button** restyled from muted grey (read as disabled)
  to active, with a spinner + disabled state while refetching.

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
0. **Multi-channel selling (Amazon, Etsy, TikTok Shop, Facebook Shop) — requested, not started.**
   This is a much bigger scope than anything else on this list: each
   platform needs its own developer account/API approval from the store
   owner (same category of blocker as eBay below, times four), plus its own
   product-sync, order-sync, and fulfillment-routing logic roughly on par
   with the existing Shopify+CJ+DSers integration. Needs a real scoping
   conversation before starting — which platform first, and the owner
   obtaining that platform's developer credentials — rather than being
   built speculatively.
1. **Real supplier-stock sync and CJ wallet balance — endpoints still not
   confirmed against a live CJ account.** `product/stock/queryByVid` and
   `shopping/pay/getBalance` were pieced together from CJ's docs/community
   reports (their doc site blocks automated fetches), not verified live.
   Both fail safe (show "unknown"/"unavailable" rather than a false zero).
   **This was almost certainly never even reachable before this round** —
   see the CJ credential bug below; now that credentials are actually
   collected correctly, check Inventory's Scan Now activity entry
   (`cjChecked`/`cjUnavailable`) and the Fulfillment page's balance number
   to confirm real data is coming through.
2. **CJ order cost in Accounting is an estimate**, not the exact CJ
   invoice amount — `createCjOrder`'s response wasn't touched (real-money
   code, left as-is on purpose) so the transaction is built from CJ's
   listed price at order time. Good enough for a live P&L trend, not
   guaranteed penny-accurate; each transaction's notes say so.
3. **Email Campaigns "byte string" crash — root cause not fully pinned
   down.** User saw `Cannot convert argument to a ByteString...`. Every
   `fetch()` header in the codebase was audited and none embed dynamic
   campaign/prospect content — the strongest remaining explanation is a
   corrupted `RESEND_API_KEY` (a "smart quote"/dash/bullet from a
   copy-paste). Added: (a) upfront validation in `sendEmail()` that catches
   this and returns an actionable message instead of a cryptic crash, (b)
   an Activity Feed entry after every campaign send showing delivered/failed
   counts and the first failure reason, so this is visible in-app instead of
   only in Railway logs. If it recurs, the Activity Feed entry will now say
   exactly what broke.
4. No automated test coverage for fulfillment/CJ/audit-fix logic beyond
   TypeScript type-checking.
5. Ads platform posting not built (by design, pending dev tokens).
6. eBay integration pending real credentials.
7. Fulfillment page shows the last 100 paid orders only (Shopify API page
   size) — no searchable full order history yet.

## Bugs fixed — round 2
- **CJ credentials UI didn't match what any working CJ code actually
  needs.** The Sourcing Settings "CJ Dropshipping" card only had a single
  "CJ Access Token" field, but CJ has no persistent access token to
  copy-paste — every real integration (`fulfillmentRunner.ts`,
  `inventoryRunner.ts`, `sourcingRunner.ts`) authenticates via API Key +
  Account Email → `getCjAccessToken()` mints a short-lived token. Since the
  UI never collected API Key/Email, `testAppConnection`("cj") and
  `pushToCjFavorites` always failed, and — more importantly — CJ auth
  likely silently failed for sourcing scrapes and the new inventory
  stock-check/wallet-balance features too, for anyone who only filled in
  the one field the old UI asked for. Fixed the form to collect API Key +
  Account Email and wired `testAppConnection`/`pushToCjFavorites` through
  the same `getCjAccessToken()` flow as everything else. **If CJ scraping,
  CJ Favorites, or real supplier-stock sync still don't work after this
  deploy, re-enter your CJ API Key + Account Email in Sourcing → App
  Connections — the old saved "access token" value is now unused.**
- **Site Audit: one bad LLM response on any single page killed the entire
  run**, discarding every issue already found on every other page and
  showing a bare "Error" badge with no explanation. Each page (of up to 22
  per run) now has its own try/catch — a failure on one page just skips
  that page instead of aborting everything, and the run completes with
  whatever succeeded. The audit UI now also shows the actual error text for
  failed/partial runs instead of just a red badge.
- **Bulk Catalog Optimizer always 400'd** ("page_info invalid value") — it
  paginated Shopify products by passing a literal incrementing page number
  (`"1"`, `"2"`...) as `page_info`, which Shopify's REST API requires to be
  an opaque cursor from its own `Link` response header, not a plain number.
  Every run failed on the very first request. Added real cursor pagination
  to `ShopifyClient` (`getProductsPage`) and fixed both the optimizer and
  `getAllProducts()` (which also silently truncated at 250 products before)
  to use it.
- **Email Scraper honesty**: this module has always been an AI persona
  generator (invented plausible-sounding people, never real scraped
  contacts) and is already correctly excluded from real campaign sends —
  but one leftover duplicate "Scrape Prospects" dialog on Email Campaigns
  presented it without the disclaimer the main tab has. Removed the
  duplicate; the header button now opens the honest, already-disclosed tab.
- **Blog generation required a manually-typed topic with no fallback** —
  added a "Suggest ideas" button (AI-brainstormed, aware of recently
  published titles to avoid repeats) and made the topic field fully
  optional: leaving it blank now has the AI pick a topic itself, so
  "generate on its own" actually works from the UI, not just the backend
  scheduler. (Email Campaign generation already worked with zero required
  input — no change needed there.)
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
- Inventory page now also links to the live storefront product page (not
  just Shopify Admin) — added a `productHandle` column (migration `0018`)
  captured during scans, since the numeric product ID alone can't build a
  working storefront URL.

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
