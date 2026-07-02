/**
 * Real open/click/unsubscribe tracking for outbound email campaigns.
 * These are plain Express GET routes (not tRPC) because tracking pixels
 * and links embedded in an email need a simple fetchable URL — an email
 * client's <img> tag or a clicked <a href> can't carry tRPC's batch-link
 * envelope.
 */
import type { Express, Request, Response } from "express";
import { getEmailCampaign, getEmailProspects, insertEmailEvent, updateEmailProspect } from "./db";

// 1x1 transparent GIF, used as the open-tracking pixel.
const TRACKING_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7",
  "base64",
);

async function verifyOwnership(campaignId: number, prospectId: number, userId: number) {
  const campaign = await getEmailCampaign(campaignId);
  if (!campaign || campaign.userId !== userId) return false;
  const prospects = await getEmailProspects(userId);
  return prospects.some(p => p.id === prospectId);
}

function parseIds(req: Request): { campaignId: number; prospectId: number; userId: number } | null {
  const campaignId = Number(req.params.campaignId);
  const prospectId = Number(req.params.prospectId);
  const userId = Number(req.params.userId);
  if (!Number.isFinite(campaignId) || !Number.isFinite(prospectId) || !Number.isFinite(userId)) return null;
  return { campaignId, prospectId, userId };
}

export function registerEmailTrackingRoutes(app: Express) {
  // Open tracking — embedded as <img src="..."> in the sent email.
  app.get("/api/email/o/:campaignId/:prospectId/:userId", async (req: Request, res: Response) => {
    res.set("Content-Type", "image/gif");
    res.set("Cache-Control", "no-store");
    const ids = parseIds(req);
    if (ids && (await verifyOwnership(ids.campaignId, ids.prospectId, ids.userId))) {
      await insertEmailEvent({
        campaignId: ids.campaignId,
        prospectId: ids.prospectId,
        userId: ids.userId,
        event: "opened",
        clickUrl: null,
        userAgent: req.headers["user-agent"] || null,
        ipAddress: req.ip || null,
      }).catch(() => {});
    }
    res.send(TRACKING_PIXEL);
  });

  // Click tracking — every link in the sent email is rewritten to point
  // here first, with the real destination in ?u=, then redirects there.
  app.get("/api/email/c/:campaignId/:prospectId/:userId", async (req: Request, res: Response) => {
    const target = typeof req.query.u === "string" ? req.query.u : "/";
    const safeTarget = /^https?:\/\//i.test(target) ? target : "/";
    const ids = parseIds(req);
    if (ids && (await verifyOwnership(ids.campaignId, ids.prospectId, ids.userId))) {
      await insertEmailEvent({
        campaignId: ids.campaignId,
        prospectId: ids.prospectId,
        userId: ids.userId,
        event: "clicked",
        clickUrl: safeTarget,
        userAgent: req.headers["user-agent"] || null,
        ipAddress: req.ip || null,
      }).catch(() => {});
    }
    res.redirect(302, safeTarget);
  });

  // One-click unsubscribe — required for real bulk sending (CAN-SPAM).
  app.get("/api/email/u/:campaignId/:prospectId/:userId", async (req: Request, res: Response) => {
    const ids = parseIds(req);
    if (ids && (await verifyOwnership(ids.campaignId, ids.prospectId, ids.userId))) {
      await updateEmailProspect(ids.prospectId, { status: "unsubscribed" }).catch(() => {});
      await insertEmailEvent({
        campaignId: ids.campaignId,
        prospectId: ids.prospectId,
        userId: ids.userId,
        event: "unsubscribed",
        clickUrl: null,
        userAgent: req.headers["user-agent"] || null,
        ipAddress: req.ip || null,
      }).catch(() => {});
    }
    res.set("Content-Type", "text/html");
    res.send(
      "<!doctype html><html><body style=\"font-family:sans-serif;text-align:center;padding:60px 20px;\">" +
        "<h2>You've been unsubscribed</h2><p>You won't receive any more emails from this list.</p></body></html>",
    );
  });
}

/**
 * Rewrites a campaign's HTML body for a specific recipient: appends an
 * open-tracking pixel, rewrites every http(s) link to route through the
 * click tracker, and appends an unsubscribe footer if the template didn't
 * already put one in.
 */
export function instrumentEmailHtml(
  html: string,
  publicBaseUrl: string,
  ids: { campaignId: number; prospectId: number; userId: number },
): string {
  const { campaignId, prospectId, userId } = ids;
  const trackedClick = (url: string) =>
    `${publicBaseUrl}/api/email/c/${campaignId}/${prospectId}/${userId}?u=${encodeURIComponent(url)}`;

  let out = html.replace(
    /href=(["'])(https?:\/\/[^"']+)\1/gi,
    (_match, quote, url) => `href=${quote}${trackedClick(url)}${quote}`,
  );

  const unsubscribeUrl = `${publicBaseUrl}/api/email/u/${campaignId}/${prospectId}/${userId}`;
  if (!out.toLowerCase().includes("unsubscribe")) {
    out += `<p style="font-size:11px;color:#999;text-align:center;margin-top:24px;">` +
      `<a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe</a></p>`;
  }

  const pixel = `<img src="${publicBaseUrl}/api/email/o/${campaignId}/${prospectId}/${userId}" width="1" height="1" style="display:none" alt="" />`;
  out += pixel;

  return out;
}
