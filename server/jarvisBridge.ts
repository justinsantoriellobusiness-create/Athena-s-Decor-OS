import { createHash, timingSafeEqual } from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { ENV } from "./_core/env";
import * as db from "./db";
import { getDashboardStats, runAutonomousModule, AUTONOMOUS_MODULES, type AutonomousModule } from "./routers";

const OWNER_OPEN_ID = "owner";

// Same constant-time-compare-via-hash approach as passwordAuth.ts, so a
// timing side-channel can't leak how many leading bytes of the token matched.
function safeEquals(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

function requireBridgeAuth(req: Request, res: Response, next: NextFunction) {
  if (!ENV.jarvisBridgeApiKey) {
    res.status(503).json({ error: "Jarvis bridge is not configured — set JARVIS_BRIDGE_API_KEY." });
    return;
  }
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !safeEquals(token, ENV.jarvisBridgeApiKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function isAutonomousModule(value: string): value is AutonomousModule {
  return (AUTONOMOUS_MODULES as readonly string[]).includes(value);
}

/**
 * Plain REST surface for the Jarvis Command Center to poll metrics and
 * delegate actions against, per CLAUDE.md's "API-first" contract: GET for
 * metrics_endpoint, POST {action, params} for actions_endpoint. Separate
 * from the tRPC API because Jarvis authenticates with a bearer API key, not
 * this app's own session cookie.
 */
export function registerJarvisBridge(app: Express) {
  app.get("/api/jarvis/status", requireBridgeAuth, async (_req, res) => {
    try {
      const stats = await getDashboardStats();
      res.json({
        shopifyConnected: stats.shopifyConnected,
        shopifyProductCount: stats.shopifyProductCount,
        activeCampaigns: stats.activeCampaigns,
        totalCampaigns: stats.totalCampaigns,
        activeModules: stats.activeModules,
        totalModules: stats.totalModules,
        keywordCount: stats.keywordCount,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/jarvis/actions", requireBridgeAuth, async (req, res) => {
    const { action } = (req.body ?? {}) as { action?: unknown; params?: unknown };
    if (typeof action !== "string" || !isAutonomousModule(action)) {
      res.status(400).json({
        error: `Unknown action "${String(action)}".`,
        validActions: AUTONOMOUS_MODULES,
      });
      return;
    }

    try {
      const owner = await db.getUserByOpenId(OWNER_OPEN_ID);
      if (!owner) {
        res.status(503).json({ error: "Owner account not provisioned yet — log into the app once first." });
        return;
      }
      const result = await runAutonomousModule(owner.id, action);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
