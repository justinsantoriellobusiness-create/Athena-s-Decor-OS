/**
 * Shared inventory scan logic — used by both the scheduled automation route
 * and the manual "Scan Now" tRPC mutation, so the two paths can't drift out
 * of sync (they previously duplicated near-identical logic independently).
 */
import { getShopifyClient } from "./shopify";
import { decryptCredential } from "./crypto";
import {
  getShopifyConfig,
  upsertInventorySnapshot,
  updateAutomationSetting,
  logActivity,
} from "./db";
import { notifyOwner } from "./_core/notification";

export type InventoryScanResult = {
  scanned: number;
  outOfStockCount: number;
  draftFailures: number;
  draftedTitles: string[];
};

export async function runInventoryScan(): Promise<InventoryScanResult> {
  const config = await getShopifyConfig();
  if (!config?.isConnected) throw new Error("Shopify not connected");

  const client = await getShopifyClient(config.storeDomain, decryptCredential(config.accessToken) ?? config.accessToken);
  const products = await client.getAllProducts();

  let outOfStockCount = 0;
  let draftFailures = 0;
  const draftedTitles: string[] = [];

  for (const product of products) {
    const imageUrl = product.images?.[0]?.src ?? null;
    for (const variant of product.variants) {
      const shopifyStock = variant.inventory_quantity;
      const status = shopifyStock === 0 ? "out_of_stock" : shopifyStock < 10 ? "low_stock" : "in_stock";
      await upsertInventorySnapshot({
        shopifyProductId: String(product.id),
        shopifyVariantId: String(variant.id),
        title: `${product.title} - ${variant.title}`,
        sku: variant.sku,
        supplierStock: shopifyStock,
        shopifyStock,
        status,
        autoUpdated: false,
        lastCheckedAt: new Date(),
        imageUrl,
      } as any);
      if (status === "out_of_stock") {
        outOfStockCount++;
        try {
          await client.updateProduct(String(product.id), { status: "draft" });
          draftedTitles.push(product.title);
        } catch (draftErr) {
          draftFailures++;
          console.warn(`[Inventory] Failed to draft out-of-stock product ${product.id}:`, draftErr);
        }
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

  await updateAutomationSetting("inventory", {
    lastRunAt: new Date(),
    lastRunStatus: "success",
    lastRunMessage: `scanned=${products.length} outOfStock=${outOfStockCount}${draftFailures ? ` draftFails=${draftFailures}` : ""}`,
  });
  await logActivity({
    module: "inventory",
    level: outOfStockCount > 0 ? "warning" : "success",
    title: `Scanned ${products.length} products — ${outOfStockCount} out of stock`,
    detail: draftedTitles.length
      ? `Auto-hidden (drafted): ${draftedTitles.slice(0, 10).join(", ")}${draftedTitles.length > 10 ? `, +${draftedTitles.length - 10} more` : ""}`
      : "All scanned products have stock.",
  });

  return { scanned: products.length, outOfStockCount, draftFailures, draftedTitles };
}
