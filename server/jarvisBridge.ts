/**
 * Jarvis bridge — the two HTTP routes the Jarvis command center calls into
 * for this business (see business_registry.json's metrics_endpoint /
 * actions_endpoint for "athenas-decor" in the Jarvis repo).
 *
 * Auth: a bearer token in ATHENAS_OS_API_KEY, dedicated to this bridge —
 * separate from ADMIN_PASSWORD (human login) and every other integration
 * credential in this app, so Jarvis never touches human-login secrets.
 *
 * /api/actions reuses the real tRPC procedures (via appRouter.createCaller)
 * against the single owner account rather than re-implementing module logic
 * here, so behavior never drifts from what a human clicking "Run now" in
 * this app's own UI gets.
 */
import type { Express, Request } from "express";
import { createHash, timingSafeEqual } from "crypto";
import { appRouter } from "./routers";
import { getUserByOpenId, getBlogPosts, getAllAutomationSettings, computePL } from "./db";

const OWNER_OPEN_ID = "owner";

const AUTOMATION_MODULES = [
  "email_scraper",
  "email_campaigns",
  "backlinker",
  "blog",
  "seo",
  "site_audit",
  "product_sourcing",
  "inventory",
  "ads",
  "accounting",
  "ai_code_assistant",
] as const;

// Same hash-then-compare approach as passwordAuth.ts's safeEquals — hashing
// first means two different-length inputs still compare in constant time,
// so no timing side-channel leaks how many leading bytes matched.
function safeEquals(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

function verifyBearer(req: Request): boolean {
  const expected = process.env.ATHENAS_OS_API_KEY;
  if (!expected) return false;

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  const provided = header.slice(7);

  return safeEquals(provided, expected);
}

export function registerJarvisBridge(app: Express) {
  app.get("/api/status", async (req, res) => {
    if (!verifyBearer(req)) {
      res.status(401).json({ error: "Missing or invalid bearer token." });
      return;
    }

    try {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 30);

      const [pl, posts, automations] = await Promise.all([
        computePL(start, now),
        getBlogPosts(1000),
        getAllAutomationSettings(),
      ]);

      res.json({
        revenue_last_30d_usd: Number(pl.grossRevenue.toFixed(2)),
        net_profit_last_30d_usd: Number(pl.netProfit.toFixed(2)),
        blog_post_count: posts.length,
        active_automations: automations.filter(a => a.enabled).length,
        total_automations: automations.length,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Status query failed." });
    }
  });

  app.post("/api/actions", async (req, res) => {
    if (!verifyBearer(req)) {
      res.status(401).json({ error: "Missing or invalid bearer token." });
      return;
    }

    const { action, params } = (req.body ?? {}) as { action?: string; params?: Record<string, unknown> };

    if (action !== "run_automation_module") {
      res.status(501).json({
        error: `Unknown action "${action}". Currently supported: "run_automation_module" with params.module set to one of validModules.`,
        validModules: AUTOMATION_MODULES,
      });
      return;
    }

    const moduleName = params?.module;
    if (typeof moduleName !== "string" || !AUTOMATION_MODULES.includes(moduleName as (typeof AUTOMATION_MODULES)[number])) {
      res.status(400).json({ error: "params.module must be one of validModules.", validModules: AUTOMATION_MODULES });
      return;
    }

    try {
      const owner = await getUserByOpenId(OWNER_OPEN_ID);
      if (!owner) {
        res.status(500).json({ error: "Owner account not found — has this app completed its first login yet?" });
        return;
      }

      const caller = appRouter.createCaller({ req, res, user: owner });
      const result = await caller.autonomous.runNow({
        module: moduleName as (typeof AUTOMATION_MODULES)[number],
        config: params?.config as Record<string, unknown> | undefined,
      });
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Action failed." });
    }
  });
}
