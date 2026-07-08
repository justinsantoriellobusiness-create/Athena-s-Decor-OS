/**
 * Autonomous order fulfillment — the core dropshipping loop.
 *
 * Guarded by a DB run-lock (tryAcquireAutomationLock) so two overlapping
 * ticks — or a manual trigger racing the scheduler — can never both place
 * an order for the same customer. Each order also gets a cj-order-<id> or
 * dsers-fulfill Shopify tag for idempotency across restarts.
 *
 * Per run (every 30 min):
 *  1. Pull paid, unfulfilled Shopify orders.
 *  2. cj-order-<id> tagged → poll CJ for tracking; when shipped, create a
 *     Shopify fulfillment so the customer is notified.
 *  3. dsers-fulfill tagged → watch; escalate to owner if unfulfilled 48h+.
 *  4. New order → map line items to a supplier via sourced_products:
 *       • all-CJ → place a real CJ order, tag cj-order-<id>.
 *       • all-DSers → tag dsers-fulfill for DSers' own Shopify sync.
 *  5. Unmappable / mixed-supplier → tag athena-skip-fulfill + notify owner.
 */
import { getShopifyClient } from "./shopify";
import { decryptCredential, decryptCredentials } from "./crypto";
import {
  getShopifyConfig, getSourcingAppCredential, getDb,
  tryAcquireAutomationLock, releaseAutomationLock,
} from "./db";
import { sourcedProducts } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";
import {
  getCjAccessToken, invalidateCjToken,
  getCjProductVariants, createCjOrder, getCjOrderStatus,
} from "./_core/cjDropshipping";
import { notifyOwner } from "./_core/notification";
import { sleep } from "./rateLimiter";

export type FulfillmentResult = {
  ordersPlaced: number;
  ordersShipped: number;
  ordersRoutedToDsers: number;
  ordersSkipped: number;
  errors: string[];
  lockedOut?: boolean;
};

const DSERS_ESCALATION_MS = 48 * 3600 * 1000;

function orderTags(order: any): string[] {
  return String(order.tags ?? "").split(",").map((t: string) => t.trim()).filter(Boolean);
}

export async function runAutoFulfillment(): Promise<FulfillmentResult> {
  const result: FulfillmentResult = { ordersPlaced: 0, ordersShipped: 0, ordersRoutedToDsers: 0, ordersSkipped: 0, errors: [] };

  // Atomic run-lock: if another fulfillment run is in progress (or a
  // redeploy left the flag set mid-tick), skip rather than risk a second
  // concurrent pass placing duplicate CJ orders.
  const acquired = await tryAcquireAutomationLock("fulfillment");
  if (!acquired) {
    result.lockedOut = true;
    return result;
  }

  let cjEmail: string | null = null;
  let rawApiKey: string | null = null;
  try {
    const config = await getShopifyConfig();
    if (!config?.isConnected) {
      result.errors.push("Shopify not connected");
      return result;
    }
    const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);

    const db = await getDb();
    if (!db) {
      result.errors.push("Database unavailable");
      return result;
    }

    const cjCred = await getSourcingAppCredential("cj");
    rawApiKey = cjCred?.apiKey ? decryptCredentials({ apiKey: cjCred.apiKey }).apiKey : null;
    cjEmail = cjCred?.apiSecret ?? null;
    const cjToken = rawApiKey && cjEmail ? await getCjAccessToken(cjEmail, rawApiKey) : null;

    const { orders } = await client.getOrders(50, "open");

    for (const order of orders) {
      try {
        if (order.fulfillment_status === "fulfilled") continue;
        if (order.cancelled_at) continue;
        const tags = orderTags(order);

        // ── Already placed with CJ: check for tracking ────────────────────
        const cjTag = tags.find(t => t.startsWith("cj-order-"));
        if (cjTag) {
          if (!cjToken) continue;
          const cjOrderId = cjTag.slice("cj-order-".length);
          const status = await getCjOrderStatus(cjToken, cjOrderId);
          if (status?.authError && cjEmail && rawApiKey) {
            invalidateCjToken(cjEmail, rawApiKey);
            result.errors.push(`CJ auth error checking order ${cjOrderId} — token invalidated, will retry next run`);
          } else if (status?.trackNumber) {
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

        // ── Routed to DSers: watch, escalate if stuck ───────────────────
        if (tags.includes("dsers-fulfill")) {
          const ageMs = Date.now() - new Date(order.created_at).getTime();
          if (ageMs > DSERS_ESCALATION_MS && !tags.includes("dsers-escalated")) {
            await client.updateOrderTags(String(order.id), [...tags, "dsers-escalated"].join(", "));
            await notifyOwner({
              title: `Order #${order.order_number} stuck in DSers for 48h+`,
              content: `This order was routed to DSers but still isn't fulfilled. Open DSers and check it — the AliExpress order may have failed or need payment confirmation.`,
            }).catch(() => {});
          }
          continue;
        }

        if (tags.includes("athena-skip-fulfill")) {
          result.ordersSkipped++;
          continue;
        }

        // ── New order: map line items to suppliers ──────────────────────
        const shipping = order.shipping_address;
        if (!shipping) { result.ordersSkipped++; continue; }

        const lineItems: any[] = order.line_items ?? [];
        const productIds = lineItems.map(li => String(li.product_id)).filter(Boolean);
        const mappings = productIds.length > 0
          ? await db.select().from(sourcedProducts).where(inArray(sourcedProducts.shopifyProductId, productIds))
          : [];
        // Only verified CJ products can auto-order — an AI-generated "cj"
        // idea has a fabricated externalId that isn't real in CJ's system.
        const sourceFor = (li: any) => mappings.find(m => m.shopifyProductId === String(li.product_id))?.source ?? null;
        const cjMappingFor = (li: any) => mappings.find(m => m.shopifyProductId === String(li.product_id) && m.source === "cj" && m.isVerified === true);

        const allCj = lineItems.length > 0 && lineItems.every(li => !!cjMappingFor(li));
        const allDsers = lineItems.length > 0 && lineItems.every(li => {
          const s = sourceFor(li);
          return s === "dsers" || s === "aliexpress";
        });

        if (allDsers) {
          await client.updateOrderTags(String(order.id), [...tags, "dsers-fulfill"].join(", "));
          result.ordersRoutedToDsers++;
          await notifyOwner({
            title: `Order #${order.order_number} routed to DSers`,
            content: `All items are DSers-sourced. DSers' Shopify sync will place the AliExpress order (approve it in DSers if you don't have auto-order enabled). The app watches this order and alerts you if it's not fulfilled within 48h.`,
          }).catch(() => {});
          continue;
        }

        if (allCj && cjToken) {
          const cjItems: { vid: string; quantity: number }[] = [];
          let unmappable = false;
          for (const li of lineItems) {
            const pid = cjMappingFor(li)?.externalId;
            if (!pid) { unmappable = true; break; }
            const variants = await getCjProductVariants(cjToken, pid);
            const match = (li.sku && variants.find(v => v.variantSku === li.sku)) || variants[0];
            if (!match) { unmappable = true; break; }
            cjItems.push({ vid: match.vid, quantity: li.quantity ?? 1 });
            await sleep(300);
          }

          if (!unmappable && cjItems.length > 0) {
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
                content: `CJ order ${cjOrderId} created for ${cjItems.length} item(s). Tracking syncs automatically once it ships.`,
              }).catch(() => {});
            }
            await sleep(500);
            continue;
          }
        }

        // ── Unmappable / mixed suppliers → manual ───────────────────────
        await client.updateOrderTags(String(order.id), [...tags, "athena-skip-fulfill"].join(", "));
        await notifyOwner({
          title: `Order #${order.order_number} needs manual fulfillment`,
          content: `Items are unmapped or split across suppliers (only orders fully mapped to verified CJ or DSers products auto-fulfill). Fulfill manually, then mark fulfilled in Shopify.`,
        }).catch(() => {});
        result.ordersSkipped++;
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
  } finally {
    const hadHardError = result.errors.length > 0 && result.ordersPlaced === 0 && result.ordersShipped === 0;
    await releaseAutomationLock(
      "fulfillment",
      hadHardError ? "error" : "success",
      `placed=${result.ordersPlaced} shipped=${result.ordersShipped} dsers=${result.ordersRoutedToDsers} skipped=${result.ordersSkipped}${result.errors.length ? ` errors=${result.errors.length}` : ""}`,
    );
  }
}
