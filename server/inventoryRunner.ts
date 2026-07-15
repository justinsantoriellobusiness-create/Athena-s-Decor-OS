/**
 * Shared inventory scan logic — used by both the scheduled automation route
 * and the manual "Scan Now" tRPC mutation, so the two paths can't drift out
 * of sync (they previously duplicated near-identical logic independently).
 *
 * For products imported from a verified CJ listing (sourced_products.source
 * === "cj" && isVerified), this also checks CJ's *real* live stock, not just
 * Shopify's own inventory count. Shopify's count only reflects what Athena
 * last told it — if the supplier sells out and nobody's touched the product
 * since, Shopify will happily keep it purchasable and an order comes in for
 * something that can never ship. Comparing against CJ's real number closes
 * that gap.
 */
import { getShopifyClient } from "./shopify";
import { decryptCredential, decryptCredentials } from "./crypto";
import {
  getShopifyConfig,
  upsertInventorySnapshot,
  setInventorySnapshotProductStatus,
  updateAutomationSetting,
  logActivity,
  getSourcingAppCredential,
  getDb,
} from "./db";
import { sourcedProducts } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import { getCjAccessToken, getCjProductVariants, getCjVariantStock } from "./_core/cjDropshipping";
import { sleep } from "./rateLimiter";

export type InventoryScanResult = {
  scanned: number;
  outOfStockCount: number;
  supplierOutOfStockCount: number;
  cjChecked: number;
  cjUnavailable: number;
  draftFailures: number;
  draftedTitles: string[];
};

export function computeStatus(shopifyStock: number, supplierStock: number | null): "in_stock" | "low_stock" | "out_of_stock" {
  if (shopifyStock === 0) return "out_of_stock";
  if (supplierStock !== null && supplierStock === 0) return "out_of_stock";
  const effective = supplierStock !== null ? Math.min(shopifyStock, supplierStock) : shopifyStock;
  return effective < 10 ? "low_stock" : "in_stock";
}

export async function runInventoryScan(): Promise<InventoryScanResult> {
  const config = await getShopifyConfig();
  if (!config?.isConnected) throw new Error("Shopify not connected");

  const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
  const products = await client.getAllProducts();

  // Load CJ auth + the verified-CJ product map once per scan (not per
  // product) to keep this to a handful of extra calls, not hundreds.
  const cjCred = await getSourcingAppCredential("cj");
  const rawApiKey = cjCred?.apiKey ? decryptCredentials({ apiKey: cjCred.apiKey }).apiKey : null;
  const cjEmail = cjCred?.apiSecret ?? null;
  const cjToken = rawApiKey && cjEmail ? await getCjAccessToken(cjEmail, rawApiKey) : null;

  const db = await getDb();
  const cjMappings = db && cjToken
    ? await db.select().from(sourcedProducts).where(and(eq(sourcedProducts.source, "cj"), eq(sourcedProducts.isVerified, true)))
    : [];
  const cjMapByProductId = new Map(cjMappings.filter(m => m.shopifyProductId).map(m => [m.shopifyProductId as string, m]));
  const cjVariantCache = new Map<string, Awaited<ReturnType<typeof getCjProductVariants>>>();

  let outOfStockCount = 0;
  let supplierOutOfStockCount = 0;
  let cjChecked = 0;
  let cjUnavailable = 0;
  let draftFailures = 0;
  const draftedTitles: string[] = [];

  for (const product of products) {
    const imageUrl = product.images?.[0]?.src ?? null;
    const cjMapping = cjToken ? cjMapByProductId.get(String(product.id)) : undefined;
    let productSupplierOutOfStock = false;

    for (const variant of product.variants) {
      const shopifyStock = variant.inventory_quantity;

      let supplierStock: number | null = null;
      let supplierSource: "cj" | "unknown" = "unknown";
      let supplierProductId: string | undefined;

      if (cjMapping?.externalId && cjToken) {
        try {
          let cjVariants = cjVariantCache.get(cjMapping.externalId);
          if (!cjVariants) {
            cjVariants = await getCjProductVariants(cjToken, cjMapping.externalId);
            cjVariantCache.set(cjMapping.externalId, cjVariants);
            await sleep(300);
          }
          const match = (variant.sku && cjVariants.find(v => v.variantSku === variant.sku)) || cjVariants[0];
          if (match) {
            const stock = await getCjVariantStock(cjToken, match.vid);
            await sleep(300);
            cjChecked++;
            if (stock === null) {
              cjUnavailable++;
            } else {
              supplierStock = stock;
              supplierSource = "cj";
              supplierProductId = cjMapping.externalId;
            }
          }
        } catch (err) {
          cjUnavailable++;
          console.warn(`[Inventory] CJ stock check failed for product ${product.id}:`, err);
        }
      }

      const status = computeStatus(shopifyStock, supplierStock);
      const supplierCaughtIt = supplierSource === "cj" && supplierStock === 0 && shopifyStock > 0;
      if (supplierCaughtIt) productSupplierOutOfStock = true;

      await upsertInventorySnapshot({
        shopifyProductId: String(product.id),
        shopifyVariantId: String(variant.id),
        title: `${product.title} - ${variant.title}`,
        sku: variant.sku,
        productHandle: product.handle,
        productStatus: product.status,
        supplierStock: supplierStock !== null ? supplierStock : shopifyStock,
        shopifyStock,
        status,
        autoUpdated: false,
        lastCheckedAt: new Date(),
        imageUrl,
        supplierSource,
        supplierProductId,
        supplierName: supplierSource === "cj" ? "CJ Dropshipping" : undefined,
      } as any);

      if (status === "out_of_stock") outOfStockCount++;
    }

    // Draft the whole product once per product (not per variant) if any
    // variant came back out of stock — mirrors Shopify's own product-level
    // visibility model.
    if (productSupplierOutOfStock || product.variants.some(v => v.inventory_quantity === 0)) {
      if (productSupplierOutOfStock) supplierOutOfStockCount++;
      try {
        await client.updateProduct(String(product.id), { status: "draft" });
        // Keep the snapshot's visibility in sync immediately, so the UI
        // shows "Hidden" right after this scan instead of one scan later.
        await setInventorySnapshotProductStatus(String(product.id), "draft");
        draftedTitles.push(productSupplierOutOfStock ? `${product.title} (supplier out of stock)` : product.title);
      } catch (draftErr) {
        draftFailures++;
        console.warn(`[Inventory] Failed to draft out-of-stock product ${product.id}:`, draftErr);
      }
    }
  }

  if (draftFailures > 0) {
    await notifyOwner({
      module: "inventory",
      level: "error",
      title: `Inventory: ${draftFailures} out-of-stock product(s) could not be hidden`,
      content: `${draftFailures} product(s) are out of stock but failed to auto-draft in Shopify and may still be purchasable. Review them in Inventory.`,
    }).catch(() => {});
  }

  const summary = `scanned=${products.length} outOfStock=${outOfStockCount} supplierCaught=${supplierOutOfStockCount} cjChecked=${cjChecked}${cjUnavailable ? ` cjUnavailable=${cjUnavailable}` : ""}${draftFailures ? ` draftFails=${draftFailures}` : ""}`;
  await updateAutomationSetting("inventory", {
    lastRunAt: new Date(),
    lastRunStatus: "success",
    lastRunMessage: summary,
  });

  const detailParts: string[] = [];
  if (draftedTitles.length) {
    detailParts.push(`Auto-hidden (drafted): ${draftedTitles.slice(0, 10).join(", ")}${draftedTitles.length > 10 ? `, +${draftedTitles.length - 10} more` : ""}`);
  } else {
    detailParts.push("All scanned products have stock.");
  }
  if (cjToken) {
    detailParts.push(
      cjChecked > 0
        ? `Live CJ supplier stock checked on ${cjChecked} variant(s)${cjUnavailable ? `, ${cjUnavailable} check(s) failed (fell back to Shopify's own count for those)` : ""}.${supplierOutOfStockCount ? ` ${supplierOutOfStockCount} product(s) were hidden because the real supplier stock was 0 even though Shopify still showed them available.` : ""}`
        : "No verified CJ-sourced products found to check real supplier stock against — only Shopify's own stock count was used."
    );
  } else {
    detailParts.push("CJ not connected — only Shopify's own stock count was used (no real supplier verification this run).");
  }

  await logActivity({
    module: "inventory",
    level: draftFailures > 0 ? "error" : outOfStockCount > 0 ? "warning" : "success",
    title: `Scanned ${products.length} products — ${outOfStockCount} out of stock`,
    detail: detailParts.join(" "),
  });

  return { scanned: products.length, outOfStockCount, supplierOutOfStockCount, cjChecked, cjUnavailable, draftFailures, draftedTitles };
}
