import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { registerPasswordAuthRoutes } from "./passwordAuth";
import { registerJarvisBridge } from "../jarvisBridge";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerScheduledRoutes } from "../scheduled";
import { registerEmailTrackingRoutes } from "../emailTracking";
import { seedDefaultSettings, seedIntegrationsFromEnv } from "../seed";
import { getDb } from "../db";
import { startInternalScheduler, stopInternalScheduler } from "./scheduler";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// Migration failure must halt boot: continuing on a possibly-mismatched
// schema means every query touching a changed table fails at request time
// instead of the deploy failing loudly and visibly in Railway.
async function runMigrations() {
  const db = await getDb();
  if (!db) {
    console.warn("[Migrate] No DATABASE_URL configured, skipping migrations");
    return;
  }
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("[Migrate] Migrations applied successfully");
  } catch (error) {
    console.error("[Migrate] Failed to apply migrations:", error);
    throw error;
  }
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerPasswordAuthRoutes(app);
  registerJarvisBridge(app);
  registerScheduledRoutes(app);
  registerEmailTrackingRoutes(app);
  await runMigrations();
  await seedDefaultSettings();
  await seedIntegrationsFromEnv();
  // tRPC API
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    startInternalScheduler(port);
  });

  // Stop scheduling new automation ticks and let Railway finish an
  // in-flight request before the process is killed on redeploy — without
  // this, a deploy landing mid-fulfillment-tick could be interrupted after
  // a CJ order was placed but before the Shopify idempotency tag was
  // written, causing the next boot to retry and double-order.
  const shutdown = (signal: string) => {
    console.log(`[Shutdown] ${signal} received — stopping scheduler and draining requests`);
    stopInternalScheduler();
    server.close(() => {
      console.log("[Shutdown] Server closed");
      process.exit(0);
    });
    // Force-exit if close() hangs (e.g. a long-running connection never drains)
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch(error => {
  console.error("[Boot] Fatal startup error:", error);
  process.exit(1);
});
