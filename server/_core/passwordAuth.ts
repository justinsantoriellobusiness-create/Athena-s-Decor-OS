import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";

export const OWNER_OPEN_ID = "owner";
const OWNER_NAME = "Athena's Decor Owner";

const SCRYPT_KEYLEN = 64;

/** Format: "saltBase64:hashBase64". Uses Node's built-in scrypt — no extra
 * dependency, same "native crypto over a library" pattern as crypto.ts. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const [saltB64, hashB64] = stored.split(":");
  if (!saltB64 || !hashB64) return false;
  try {
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = scryptSync(password, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// In-memory login rate limiter, keyed by client IP. Resets on redeploy
// (acceptable — a redeploy is already a meaningful barrier to a brute-force
// attempt in progress). Not distributed across instances, but this app runs
// as a single Railway instance.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60_000;
const attempts = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

function clearAttempts(ip: string) {
  attempts.delete(ip);
}

// Constant-time string compare via hash — avoids leaking how many leading
// characters matched through response-time variance.
export function safeEquals(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export function registerPasswordAuthRoutes(app: Express) {
  app.post("/api/auth/password-login", async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";

    if (isRateLimited(ip)) {
      res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes." });
      return;
    }

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

    if (typeof email !== "string" || typeof password !== "string" || !safeEquals(email, ENV.adminEmail)) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    // A password changed via Settings takes precedence over the bootstrap
    // ADMIN_PASSWORD env var — until changed, the env var is still what's
    // checked, so nothing breaks for anyone who's never used this feature.
    const existingUser = await db.getUserByOpenId(OWNER_OPEN_ID);
    const passwordOk = existingUser?.passwordHash
      ? verifyPasswordHash(password, existingUser.passwordHash)
      : safeEquals(password, ENV.adminPassword);

    if (!passwordOk) {
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

      clearAttempts(ip);
      res.json({ success: true });
    } catch (error) {
      console.error("[PasswordAuth] Login failed", error);
      res.status(500).json({ error: "Login failed" });
    }
  });
}
