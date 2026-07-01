# Athena's OS — Project TODO

## Phase 2: Design System & Schema
- [x] Global CSS design tokens (premium dark theme, gold accent, typography)
- [x] Database schema: shopify_config, automation_settings, seo_jobs, seo_keywords, blog_posts, sourcing_specs, sourced_products, inventory_snapshots, ad_campaigns, ad_creatives
- [x] Apply all migrations

## Phase 3: Layout, Navigation & Shopify Integration
- [x] DashboardLayout customized with sidebar nav for all 8 modules
- [x] Shopify Integration page (API key connect, store sync status)
- [x] tRPC router: shopify (connect, test, sync, getProducts)
- [x] Shopify API helper (server/shopify.ts)

## Phase 4: Central Dashboard & Automation Scheduler
- [x] Dashboard page: module status cards, automation health, quick actions
- [x] Automation Scheduler page: per-module cron config, enable/disable toggles
- [x] tRPC router: dashboard (stats, moduleStatus)
- [x] tRPC router: scheduler (getSettings, updateSettings)
- [x] Heartbeat/cron job wiring for all modules

## Phase 5: SEO Module & Blog Automation
- [x] SEO Module page: keyword table, product SEO optimizer, site audit results
- [x] tRPC router: seo (runKeywordResearch, optimizeProduct, runAudit, getJobs, getKeywords)
- [x] Blog Automation page: post list, generate, schedule, draft/publish controls
- [x] tRPC router: blog (generatePost, listPosts, updatePost, deletePost, publishPost)
- [x] AI blog content + image generation integration

## Phase 6: Product Sourcing & Inventory Tracker
- [x] Product Sourcing page: spec builder, scrape results table, bulk import
- [x] tRPC router: sourcing (createSpec, runScrape, listResults, bulkImport)
- [x] Inventory Tracker page: product list, stock status, sync controls
- [x] tRPC router: inventory (scanProducts, getSnapshots, syncStatus)

## Phase 7: Ad Automation
- [x] Ad Automation page: campaign list, creative generator, budget controls
- [x] tRPC router: ads (generateCreative, createCampaign, listCampaigns, optimizeBudget)
- [x] AI creative generation from product images and UGC

## Phase 8: Polish & Delivery
- [x] Wire all cron/heartbeat jobs to scheduler settings
- [x] Run vitest tests (3 tests passing)
- [x] Final visual polish pass
- [x] Checkpoint and deliver

## Enhancement Round 2

- [x] Blog: branded AI image generation with descriptive alt text (Athena's Decor brand/vibe/products)
- [x] Blog: display featured image in post list and preview panel
- [x] Sourcing: add shipping time filter (max days) to spec builder
- [x] Sourcing: add inventory/stock filter to spec builder
- [x] Sourcing: AI product scoring (1-10 score per scraped product with reasoning)
- [x] Sourcing: "Best Picks" highlight — AI suggests top 3-5 products from each scrape
- [x] Analytics page: overall business metrics dashboard (SEO, blog, inventory, ads)
- [x] Analytics page: SEO keyword trends chart, top keywords table
- [x] Analytics page: blog post performance (published count, AI-generated count)
- [x] Analytics page: ad campaign performance (spend, ROAS, CTR, conversions)
- [x] Analytics page: inventory health (in-stock %, low stock count, out-of-stock count)
- [x] AI Assistant page: conversational chat interface with streaming responses
- [x] AI Assistant: can execute actions (run SEO, generate blog, scan inventory, optimize budget, etc.)
- [x] AI Assistant: aware of current store state (products, settings, recent jobs)
- [x] AI Assistant: tool-calling backend with action dispatcher

## Enhancement Round 3 — AI Site Audit & Optimization

- [x] AI Site Audit: crawl all Shopify pages (products, collections, pages, blog) and score for SEO, CRO, traffic
- [x] AI Site Audit: generate issue list with severity (critical/warning/info) per page
- [x] AI Site Audit: check title tags, meta descriptions, H1s, alt text, page speed signals, internal links, schema markup
- [x] AI Site Audit: CRO analysis (product descriptions, CTA clarity, trust signals, image quality)
- [x] AI Fix Executor: one-click apply fixes to Shopify (product titles, meta, alt text, descriptions)
- [x] AI Fix Executor: bulk apply all critical fixes across entire store
- [x] AI Fix Executor: preview diff before applying (before/after)
- [x] AI Fix Executor: track fix history with timestamps
- [x] SEO page: add Site Audit tab alongside keyword research and product optimizer
- [x] Analytics page: site-wide metrics (products, blogs, inventory health, ad campaigns)
- [x] Analytics page: SEO score trend, audit history chart
- [x] AI Assistant: streaming chat with action execution across all modules including audit/fix

## Enhancement Round 4 — Automation Everywhere + Site Audit

- [x] Schema: site_audit_runs table (id, status, score, pageCount, issueCount, createdAt)
- [x] Schema: site_audit_issues table (id, runId, pageType, pageId, pageTitle, pageUrl, issueType, severity, description, suggestion, currentValue, fixedValue, status, fixedAt)
- [x] Site Audit router: runAudit, getAuditRuns, getAuditIssues, applyFix, applyAllFixes, previewFix
- [x] Site Audit page: audit run history, issue list with severity badges, before/after diff preview, apply fix button per issue, apply all critical fixes button
- [x] Automation toggle on every module page (SEO, Blog, Sourcing, Inventory, Ads, Audit)
- [x] Automation schedule picker inline on each module page (not just Scheduler page)
- [x] Scheduler page: show all automations in one place with last run, next run, status
- [x] Analytics page: business overview (products, blogs, keywords, campaigns, inventory health)
- [x] Analytics page: SEO audit score history chart
- [x] AI Assistant page: streaming chat, can run audit, apply fixes, generate blog, run SEO, optimize ads, scan inventory

## Accounting Module

- [x] Schema: financial_accounts table (id, name, type, provider, credentials, balance, currency, lastSyncedAt)
- [x] Schema: transactions table (id, accountId, date, description, amount, type, category, subcategory, taxDeductible, notes, source, externalId)
- [x] Schema: expense_categories table (id, name, type, taxDeductible, description)
- [x] Schema: tax_settings table (id, taxYear, businessName, ein, filingStatus, stateCode, quarterlyDates)
- [x] Backend: account CRUD (add PayPal, Shopify, bank, credit card, etc.)
- [x] Backend: transaction import from Shopify (sales, refunds, fees, payouts)
- [x] Backend: manual transaction entry
- [x] Backend: P&L calculation (gross revenue, COGS, gross profit, expenses by category, net profit)
- [x] Backend: tax summary (quarterly estimates, deductible expenses, Schedule C categories)
- [x] Backend: expense breakdown by category with % of revenue
- [x] Backend: cash flow summary (monthly in/out)
- [x] UI: Accounting overview with KPI cards (gross revenue, net profit, total expenses, profit margin)
- [x] UI: P&L statement (income statement format, monthly/quarterly/annual)
- [x] UI: Expense breakdown with donut chart and category table
- [x] UI: Tax summary tab (quarterly estimates, deductible expenses, Schedule C)
- [x] UI: Accounts management (connect/disconnect, sync, balance display)
- [x] UI: Transaction ledger with filters, search, category editing
- [x] UI: Cash flow chart (monthly revenue vs expenses)
- [x] Navigation: add Accounting to sidebar under a Finance section

## Accounting — eBay Integration

- [x] eBay as a financial account type with its own fee structure
- [x] eBay-specific transaction categories: Final Value Fee, Insertion Fee, Promoted Listings Fee, Shipping Label Fee, International Fee, Dispute/Chargeback
- [x] Manual eBay transaction entry with fee auto-calculator (FVF = 13.25% of sale + $0.30)
- [x] eBay revenue tracked separately from Shopify in P&L but merged in totals
- [x] eBay fees shown as separate expense line items in tax summary

## Accounting — Deduplication Engine

- [x] Add `fingerprint` and `isDuplicate` columns to transactions schema
- [x] Build fingerprint generator (source + externalId + amount + date hash)
- [x] Check fingerprint on every insert — skip if already exists
- [x] Cross-platform duplicate detection (same fee on Shopify + eBay/PayPal)
- [x] Flag suspected duplicates in transaction ledger UI with warning badge
- [x] Exclude isDuplicate transactions from P&L and tax calculations
- [x] Show duplicate count warning in Accounts tab
- [x] Fix TypeScript errors in AccountingPage
- [x] Wire Accounting route in App.tsx and AppLayout sidebar
- [x] Daily heartbeat cron: auto-sync all connected accounts at midnight
- [x] Auto-sync Shopify: pull all new orders/refunds/fees since last sync
- [x] Auto-sync eBay: pull transactions since last sync (manual + API)
- [x] Auto-sync PayPal: pull transactions since last sync
- [x] Auto-sync ad platforms: pull daily spend totals
- [x] Show last sync time and next sync time on Accounts tab
- [x] Show sync status badge (syncing / synced / error) per account
- [x] Notify owner when sync fails

## Full Platform Audit & Security Hardening

- [ ] Audit all tRPC routers — verify every procedure has proper auth guards (protectedProcedure)
- [ ] Audit credential storage — ensure API keys/tokens are never returned to client in plain text
- [ ] Audit Shopify credentials — encrypt access token at rest, never expose in list responses
- [ ] Audit eBay/PayPal credentials — same encryption requirement
- [ ] Verify all input validation (Zod schemas) on every mutation
- [ ] Verify all error handling — no unhandled promise rejections, no raw error messages to client
- [ ] Fix any broken tRPC procedure calls in frontend (wrong procedure names, wrong input shapes)
- [ ] Verify all loading/empty/error states on every page
- [ ] Verify Shopify connect flow works end-to-end
- [ ] Verify Blog generate flow works end-to-end
- [ ] Verify SEO keyword research flow works end-to-end
- [ ] Verify Inventory scan flow works end-to-end
- [ ] Verify Accounting sync flow works end-to-end
- [ ] Verify Sourcing scrape flow works end-to-end
- [ ] Verify Ads creative generation flow works end-to-end
- [ ] Verify Site Audit flow works end-to-end
- [ ] Verify AI Assistant can execute all actions
- [ ] Verify Scheduler enable/disable toggles work
- [ ] Security: add rate limiting awareness to sensitive endpoints
- [ ] Security: ensure JWT_SECRET is used for all session cookies
- [ ] Security: verify no API keys are logged to console
- [ ] Final TypeScript check (0 errors)
- [ ] All tests passing
- [ ] Screenshots of all pages
- [ ] Final checkpoint

## Rebuild: Bulk Product Optimizer & Actionable Site Audit

- [ ] Schema: bulk_optimization_jobs table (id, status, totalProducts, completedProducts, startedAt, completedAt, errorCount)
- [ ] Schema: optimization_queue table (id, jobId, shopifyProductId, title, status, optimizedTitle, optimizedDescription, metaTitle, metaDescription, errorMessage, processedAt)
- [ ] Schema: audit_fix_log table (id, auditRunId, issueId, fixType, fieldChanged, oldValue, newValue, appliedAt)
- [ ] Backend: startOptimizeCatalog — fetch all Shopify products, create job + queue rows, return jobId
- [ ] Backend: processOptimizationBatch — process N products with LLM (title, desc, metaTitle ≤60, metaDesc ≤160), push to Shopify with rate limiting (2 req/s, exponential backoff on 429)
- [ ] Backend: getOptimizationJob — return job + queue rows for polling
- [ ] Backend: cancelOptimizationJob — mark job as cancelled
- [ ] Backend: audit categorizeIssues — label each issue auto_fixable or manual_fix_required
- [ ] Backend: autoFixIssue — generate fix with LLM, push to Shopify, write audit_fix_log row
- [ ] Backend: autoFixAll — batch auto-fix all auto_fixable issues in a run
- [ ] Backend: getFixLog — return audit_fix_log rows for a run
- [ ] Frontend: SeoPage — "Optimize Entire Catalog" button, live progress bar, ETA, per-product status table
- [ ] Frontend: SeoPage — polling every 2s during active job, auto-stop when complete/error
- [ ] Frontend: SeoPage — cancel job button, error count badge, completion summary
- [ ] Frontend: AuditPage — split issues into Auto-Fixable and Manual Fix Required sections
- [ ] Frontend: AuditPage — "Auto-Fix All" button at top of auto-fixable section with confirmation dialog
- [ ] Frontend: AuditPage — individual "Resolve" button per auto-fixable issue with loading state
- [ ] Frontend: AuditPage — Execution Log tab showing all changes (field, old value, new value, timestamp)

## Autonomous Growth Engine Sprint

- [ ] Schema: add productLinks + featuredImageUrl to email_campaigns table
- [ ] Schema: add autonomousMode + autoFrequencyDays + lastAutoRunAt to automation_settings
- [ ] Backend: generateCampaignWithProducts - AI generates email body with product images and links
- [ ] Backend: autonomous email scraper procedure (runs on schedule)
- [ ] Backend: autonomous email campaign procedure (creates + sends on schedule)
- [ ] Backend: autonomous blog poster procedure (generates + publishes on schedule)
- [ ] Backend: autonomous backlinker procedure (discovers + outreach on schedule)
- [ ] Scheduled route: /api/scheduled/backlinker
- [ ] Scheduled route: /api/scheduled/email-campaigns
- [ ] Scheduled route: /api/scheduled/email-scraper
- [ ] Scheduled route: /api/scheduled/blog-autonomous
- [ ] BacklinkerPage: fix Opportunities tab (remove disabled gate, make standalone)
- [ ] BacklinkerPage: AI Best-Site Discovery panel (no campaign required)
- [ ] BacklinkerPage: Autonomous Mode panel with frequency + enable/disable
- [ ] EmailCampaignsPage: product image picker in campaign builder
- [ ] EmailCampaignsPage: product link inserter in campaign body
- [ ] EmailCampaignsPage: raise scraper cap to 1000 in UI
- [ ] EmailCampaignsPage: Autonomous Mode panel (auto-scrape + auto-send)
- [ ] BlogPage: Autonomous Mode panel (frequency, keywords, auto-publish, product linking)
- [ ] End-to-end test: TypeScript zero errors
- [ ] End-to-end test: full vitest suite passes
- [ ] End-to-end test: screenshot all major modules
