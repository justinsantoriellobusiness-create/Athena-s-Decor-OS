import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";

const OWNER_OPEN_ID = "owner";
const OWNER_NAME = "Athena's Decor Owner";

export function registerPasswordAuthRoutes(app: Express) {
  app.post("/api/auth/password-login", async (req: Request, res: Response) => {
    const { email, password } = (req.body ?? {}) as {
      email?: unknown;
      password?: unknown;
    };

    if (!ENV.adminEmail || !ENV.adminPassword) {
      res.status(500).json({
        error: "Login is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD.",
      });
      return;
    }

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email !== ENV.adminEmail ||
      password !== ENV.adminPassword
    ) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    try {
      await db.upsertUser({
        openId: OWNER_OPEN_ID,
        name: OWNER_NAME,
        email: ENV.adminEmail,
        loginMethod: "password",
        role: "admin",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(OWNER_OPEN_ID, {
        name: OWNER_NAME,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("[PasswordAuth] Login failed", error);
      res.status(500).json({ error: "Login failed" });
    }
  });
}
