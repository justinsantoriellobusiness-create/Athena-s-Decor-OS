/**
 * Helper to get a ready-to-use ShopifyClient with the decrypted access token.
 * Always use this instead of calling getShopifyClient directly with config.accessToken,
 * because the stored token is AES-256-GCM encrypted at rest.
 */
import { getShopifyConfig } from "./db";
import { getShopifyClient } from "./shopify";
import { decryptCredential } from "./crypto";
import { TRPCError } from "@trpc/server";

export async function getConnectedShopifyClient() {
  const config = await getShopifyConfig();
  if (!config?.isConnected) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Shopify not connected. Connect your store in Settings → Shopify first.",
    });
  }
  // Decrypt the stored access token before use
  const rawToken = decryptCredential(config.accessToken) ?? config.accessToken;
  return { client: await getShopifyClient(config.storeDomain, rawToken), config };
}
