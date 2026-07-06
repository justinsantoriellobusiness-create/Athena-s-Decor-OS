/**
 * Autonomous order fulfillment — the core dropshipping loop.
 *
 * Every run (scheduled every 30 min via the "fulfillment" automation module):
 *  1. Pull paid, unfulfilled Shopify orders.
 *  2. Orders already sent to CJ (tagged cj-order-<id>) → poll CJ for a
 *     tracking number; when available, create a Shopify fulfillment so the
 *     customer gets their shipping notification.
 *  3. New orders → map each line item to its CJ product via sourced_products
 *     (source=cj, shopifyProductId set at import time), resolve the CJ
 *     variant, and place a real CJ order (paid from CJ wallet balance).
 *     The Shopify order is tagged cj-order-<cjOrderId> for idempotency.
 *  4. Orders with items that can't be mapped to CJ are tagged
 *     athena-skip-fulfill (so they're not retried every run) and the owner
 *     is notified to fulfill manually.
 */
import { getShopifyClient } from "./shopify";
import { decryptCredential, decryptCredentials } from "./crypto";
import { getShopifyConfig, getSourcingAppCredential, getDb } from "./db";
import { sourcedProducts } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";
import {
  getCjAccessToken,
  getCjProductVariants,
  createCjOrder,
  getCjOrderStatus,
} from "./_core/cjDropshipping";
import { notifyOwner } from "./_core/notification";
import { sleep } from "./rateLimiter";

export type FulfillmentResult = {
  ordersPlaced: number;
  ordersShipped: number;
  ordersSkipped: number;
  errors: string[];
};

function orderTags(order: any): string[] {
  return String(order.tags ?? "").split(",").map((t: string) => t.trim()).filter(Boolean);
}

export async function runAutoFulfillment(): Promise<FulfillmentResult> {
  const result: FulfillmentResult = { ordersPlaced: 0, ordersShipped: 0, ordersSkipped: 0, errors: [] };

  const config = await getShopifyConfig();
  if (!config?.isConnected) {
    result.errors.push("Shopify not connected");
    return result;
  }
  const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);

  const cjCred = await getSourcingAppCredential("cj");
  const rawApiKey = cjCred?.apiKey ? decryptCredentials({ apiKey: cjCred.apiKey }).apiKey : null;
  const cjEmail = cjCred?.apiSecret ?? null;
  const cjToken = rawApiKey && cjEmail ? await getCjAccessToken(cjEmail, rawApiKey) : null;
  if (!cjToken) {
    result.errors.push("CJ Dropshipping not connected or auth failed");
    return result;
  }

  const db = await getDb();
  if (!db) {
    result.errors.push("Database unavailable");
    return result;
  }

  const { orders } = await client.getOrders(50, "open");

  for (const order of orders) {
    try {
      if (order.fulfillment_status === "fulfilled") continue;
      if (order.cancelled_at) continue;
      const tags = orderTags(order);

      // ── Already placed with CJ: check for tracking ──────────────────────
      const cjTag = tags.find(t => t.startsWith("cj-order-"));
      if (cjTag) {
        const cjOrderId = cjTag.slice("cj-order-".length);
        const status = await getCjOrderStatus(cjToken, cjOrderId);
        if (status?.trackNumber) {
          const fos = await client.getFulfillmentOrders(String(order.id));
          const openFos = (fos.fulfillment_orders ?? []).filter(
            (f: any) => f.status === "open" || f.status === "in_progress"
          );
          if (openFos.length > 0) {
            await client.createFulfillment(
              openFos.map((f: any) => f.id),
              status.trackNumber,
              status.logisticName || "CJPacket",
              true
            );
            result.ordersShipped++;
            await notifyOwner({
              title: `Order #${order.order_number} shipped`,
              content: `Tracking ${status.trackNumber} (${status.logisticName || "CJ"}) synced to Shopify — customer notified.`,
            }).catch(() => {});
          }
        }
        await sleep(300);
        continue;
      }

      // ── Skipped previously (unmappable) — don't retry every run ───────────
      if (tags.includes("athena-skip-fulfill")) {
        result.ordersSkipped++;
        continue;
      }

      // ── New order: map line items to CJ variants ───────────────────────
      const shipping = order.shipping_address;
      if (!shipping) {
        result.ordersSkipped++;
        continue;
      }

      const cjItems: { vid: string; quantity: number }[] = [];
      let unmappable = false;
      for (const li of order.line_items ?? []) {
        const rows = await db.select().from(sourcedProducts)
          .where(and(
            eq(sourcedProducts.shopifyProductId, String(li.product_id)),
            eq(sourcedProducts.source, "cj"),
          ))
          .limit(1);
        const pid = rows[0]?.externalId;
        if (!pid) { unmappable = true; break; }
        const variants = await getCjProductVariants(cjToken, pid);
        const match = (li.sku && variants.find(v => v.variantSku === li.sku)) || variants[0];
        if (!match) { unmappable = true; break; }
        cjItems.push({ vid: match.vid, quantity: li.quantity ?? 1 });
        await sleep(300);
      }

      if (unmappable || cjItems.length === 0) {
        await client.updateOrderTags(String(order.id), [...tags, "athena-skip-fulfill"].join(", "));
        await notifyOwner({
          title: `Order #${order.order_number} needs manual fulfillment`,
          content: `One or more items on this order aren't mapped to a CJ product (only products imported through Sourcing → CJ can auto-fulfill). Fulfill it manually, then mark it fulfilled in Shopify.`,
        }).catch(() => {});
        result.ordersSkipped++;
        continue;
      }

      const cjOrderId = await createCjOrder(cjToken, {
        orderNumber: `ATHENA-${order.order_number}`,
        shippingCustomerName: `${shipping.first_name ?? ""} ${shipping.last_name ?? ""}`.trim() || shipping.name || "Customer",
        shippingCountryCode: shipping.country_code ?? "US",
        shippingProvince: shipping.province ?? "",
        shippingCity: shipping.city ?? "",
        shippingAddress: [shipping.address1, shipping.address2].filter(Boolean).join(", "),
        shippingZip: shipping.zip ?? "",
        shippingPhone: shipping.phone || order.phone || "0000000000",
        email: order.email ?? undefined,
        products: cjItems,
      });

      if (cjOrderId) {
        await client.updateOrderTags(String(order.id), [...tags, `cj-order-${cjOrderId}`].join(", "));
        result.ordersPlaced++;
        await notifyOwner({
          title: `Order #${order.order_number} auto-placed with CJ`,
          content: `CJ order ${cjOrderId} created for ${cjItems.length} item(s). Tracking will sync automatically once it ships.`,
        }).catch(() => {});
      }
      await sleep(500);
    } catch (err: any) {
      result.errors.push(`Order #${order.order_number}: ${err.message}`);
    }
  }

  if (result.errors.length > 0) {
    await notifyOwner({
      title: "Auto-fulfillment: some orders had errors",
      content: result.errors.slice(0, 10).join("\n"),
    }).catch(() => {});
  }

  return result;
}
