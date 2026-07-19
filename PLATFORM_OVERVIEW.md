# Athena's Decor OS — Platform Overview

*Last updated: 2026-07-19*

A single reference document for owners, investors, and prospective customers/partners. It explains what the platform is, what it actually does today, how it's built, and where it's headed.

---

## 1. What It Is (One Paragraph)

Athena's Decor OS is an autonomous back-office operating system for a Shopify e-commerce brand. It runs the day-to-day work of a dropshipping business — sourcing products, fulfilling orders, tracking inventory, writing SEO/blog content, running email campaigns, auditing the storefront, and closing the books — on a schedule, with AI (Anthropic Claude) doing the judgment calls a human operator would otherwise make. A human owner watches one dashboard and one Activity Feed instead of stitching together a dozen disconnected tools.

**Live deployment:** Railway, auto-deployed from the `main` branch of `justinsantoriellobusiness-create/Athena-s-Decor-OS`.

---

## 2. The Problem It Solves

Running a lean dropshipping storefront normally means manually juggling: a supplier dashboard (CJ Dropshipping / DSers), Shopify admin, a spreadsheet for bookkeeping, an SEO tool, a blog CMS, an email tool, and ad platforms — with no single source of truth for "is everything actually working right now." Athena's Decor OS replaces that patchwork with one operating system that:

- **Automates the repetitive work** (fulfillment, inventory sync, content generation, bookkeeping) on a schedule, unattended.
- **Tells the truth about what's real** — every module distinguishes verified live data (a real CJ listing, a real Shopify order) from AI-generated suggestions (a sourcing "idea," a budget recommendation), so the owner never mistakes a recommendation for an executed action.
- **Surfaces proof of work** via a real-time Activity Feed, so automation isn't a black box.

---

## 3. Core Value Proposition

| For | Value |
|---|---|
| **Owner/operator** | One dashboard replaces a dozen tabs; real automation handles fulfillment, restocking, content, and books while you sleep; low-balance and error alerts mean you find out about problems before customers do. |
| **Investor** | A working, revenue-touching automation stack (order fulfillment moves real money through a live CJ wallet) with audited code, typed end-to-end (TypeScript), and a clear roadmap to multi-channel selling. |
| **Customer (of the storefront)** | Indirect benefit — faster restocks, fewer out-of-stock surprises, and consistent content/SEO, because the back office runs itself. |

---

## 4. Feature Modules

Each module is a page in the app (sidebar navigation) backed by real database tables and, where noted, live third-party API calls.

### Revenue-critical (touches real money / real orders)
- **Fulfillment** — the core automation. Every 30 minutes (or on-demand via "Run Fulfillment Now"), paid Shopify orders are matched to their sourced supplier (CJ Dropshipping or DSers) and placed automatically. CJ orders are placed for real money from a CJ wallet balance; DSers orders are tagged for DSers' own Shopify sync. Protected by a database-backed lock so it can never double-place an order. Shows every paid order's real state (pending / placed / shipped / routed to DSers / stuck / needs manual) and a live CJ wallet balance with a low-balance warning.
- **Inventory Tracker** — real Shopify + CJ supplier stock side by side, per-variant "Set Stock" writes straight to Shopify, auto-hides out-of-stock listings on every scan, and links out to both Shopify Admin and the live storefront listing.
- **Accounting** — automatic COGS: every real CJ order the fulfillment engine places writes a matching expense transaction into the books automatically (flagged as an estimate, since it's based on CJ's listed price, not the exact invoice). Also supports manual transactions, multi-account tracking, P&L, tax summary, cash-flow view, and duplicate-transaction detection.

### Growth & marketing automation
- **Sourcing** — scrapes/searches for new products against owner-defined criteria; every result is explicitly tagged **Verified** (a real, live CJ listing) or **AI idea** (a research suggestion with no live match — DSers/AliExpress have no public search API, so nothing is ever silently auto-imported from a fake ID).
- **SEO** — AI keyword research, product-level SEO optimization, and a bulk catalog optimizer that rewrites entire-catalog metadata via LLM.
- **Site Audit** — AI crawls the live storefront, scores pages for SEO/CRO issues, categorizes each finding as auto-fixable or manual, and can apply fixes directly to Shopify with an execution log of every change.
- **Blog** — AI-generated blog posts with branded images, optional AI-suggested topics, product linking, and scheduled auto-publishing to the Shopify blog.
- **Email Campaigns** — campaign builder with a live-catalog product picker (real images/prices/links, nothing invented), subject-line A/B testing with per-variant open/click tracking, and a clearly-disclosed AI prospect generator (explicitly not real scraped contacts).
- **Backlinker** — AI discovery of backlink opportunities and outreach tracking.
- **Ads** — AI budget *recommendations* for Meta/Google/TikTok; does not post live campaigns (no ad-platform dev tokens connected yet — by design, not a bug).

### Operations & oversight
- **Dashboard** — top-line KPIs and module health at a glance.
- **Analytics** — real Shopify sales data (revenue, orders, AOV, daily trend, top products for 7d/30d) plus a real Net Profit figure pulled from Accounting.
- **Activity Feed** — the platform's "proof it's working" surface: every automation run, success or failure, writes a real timestamped log entry here.
- **AI Assistant** — a chat interface with tool-calling access to the platform's own actions (run an SEO audit, generate a blog post, scan inventory, sync products, etc.), so the owner can operate the system conversationally.
- **Automation Scheduler / Hub** — per-module automation toggles, human-readable frequency labels (e.g. "Daily at 9am ET" instead of raw cron), enable-all/disable-all controls.
- **Integrations** — connection management for Shopify, CJ Dropshipping, DSers, and other external services.

---

## 5. What's Real vs. What's Roadmap (Honesty Section)

This platform is built and operated on a strict "never claim it works without a concrete check" standard. Current state:

**Live and connected today:**
- **Shopify** — full Admin API integration (OAuth client-credentials, auto-refreshing tokens).
- **CJ Dropshipping** — real product search, real order placement (real money), stock/wallet-balance checks.
- **DSers** — orders routed through DSers' own Shopify sync.

**Not yet connected (explicitly, not hidden):**
- **eBay** — pending the owner obtaining API credentials.
- **Google / Facebook / TikTok Ads** — AI produces budget recommendations only; no live campaign posting (needs developer tokens).
- **Multi-channel selling (Amazon, Etsy, TikTok Shop, Facebook Shop)** — requested but not started; each is its own scoped project requiring platform-specific developer approval.

This transparency is a deliberate product principle, not a gap in the doc — every module in the UI marks synthetic/AI content differently from verified live data.

---

## 6. Technical Architecture

**Stack**
- **Frontend:** React 19, Vite, Tailwind CSS 4, shadcn/ui (Radix primitives), wouter for routing, TanStack Query, recharts for charts.
- **Backend:** Express 4 + tRPC 11 (fully typed client↔server contract), Zod validation on every mutation.
- **Database:** MySQL/TiDB via Drizzle ORM — 30+ tables covering core config, SEO/content, product/sourcing, financial, and marketing domains, versioned migrations in `drizzle/`.
- **AI:** Anthropic Claude for all LLM calls (content generation, scoring, audit analysis, the AI Assistant's tool-calling loop); a separate image-generation provider for blog/ad creative.
- **Scheduling:** in-process cron (`server/_core/scheduler.ts` + `server/scheduled.ts`) drives every automated module run.
- **Deployment:** Railway, auto-deploy on push to `main`; Nixpacks build.

**Reliability & safety properties**
- Database-backed locking on the fulfillment runner prevents double-placing orders.
- Per-page error isolation in Site Audit (one bad LLM response can't kill an entire run).
- Migration failures halt boot rather than silently running against a broken schema.
- Per-page error boundaries so a single page crash can't blank the whole app.
- Upfront validation of API keys (Anthropic, image, email) with actionable error messages instead of cryptic runtime failures.
- Owner notifications on key failure/threshold events (e.g., CJ wallet balance dropping below $20).
- A full line-by-line, 15-module security/correctness audit has been completed (auth rate-limiting, API rate-limit/timeout handling, closed an open-redirect in email click-tracking, fixed fake credential-validation that accepted any string as "connected", graceful shutdown, etc.).

**Current quality bar:** builds clean (`npm run build`), zero TypeScript errors (`npx tsc --noEmit`), automated test suite passing (`npx vitest run`).

---

## 7. Data Model (Highlights)

Organized by domain, ~30 tables total:
- **Core:** users, Shopify config, encrypted integration credentials, per-module automation settings.
- **Sourcing & Inventory:** sourcing specs, sourced products (AI-scored), inventory snapshots, sourcing app credentials.
- **Content & SEO:** SEO keywords, site audit runs/issues, audit fix log, blog posts, bulk optimization jobs.
- **Marketing:** ad campaigns/creatives, email campaigns/prospects/events, backlink campaigns/opportunities.
- **Financial:** financial accounts, transactions, tax settings.
- **Operational:** activity log (the audit trail behind the Activity Feed).

---

## 8. Known Gaps (Actively Tracked, Not Hidden)

1. Multi-channel selling beyond Shopify — needs a scoping decision and per-platform developer credentials.
2. CJ supplier-stock and wallet-balance endpoints were pieced together from CJ's documentation (their docs block automated fetches) and should be reconfirmed against a live account periodically; they fail safe (show "unknown" rather than a false zero).
3. CJ order cost in Accounting is a listed-price estimate, not the exact invoice amount.
4. No automated test coverage yet for fulfillment/CJ/audit-fix logic beyond TypeScript type-checking.
5. Ad-platform posting and eBay integration both pending credentials the owner needs to obtain.
6. Fulfillment page currently shows the last 100 paid orders (a Shopify API page-size limit) — no searchable full order history yet.

---

## 9. Elevator Pitches (by audience)

**To an investor:** "Athena's Decor OS is a working AI operating system for e-commerce back-office ops — it already moves real money through automated order fulfillment, keeps its own books, and runs SEO/content/email growth loops unattended, all built on a typed, tested, audited stack. The roadmap is horizontal: the same automation core extends to new sales channels and ad platforms as credentials come online."

**To a customer/partner considering the storefront or a white-label version:** "Every part of your store's back office — restocking, order fulfillment, content, marketing — runs on autopilot, with a live feed showing exactly what happened and why, so nothing is a black box."

**To the owner (internal):** "Check the Activity Feed and Fulfillment page before assuming anything ran. Real money moves through CJ order placement — every change there is treated with payments-system-level care."

---

*Source documents: `ATHENA_STATUS.md` (durable engineering log, current source of truth for build state) and `PROJECT_HANDOFF_CLAUDE.md` (earlier handoff notes; superseded on stack/module details by `ATHENA_STATUS.md` where they differ).*
