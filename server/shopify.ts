/**
 * Shopify Admin API helper
 * All calls go through the Admin REST API using the stored access token.
 */
import { withRateLimit } from "./rateLimiter";

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  status: string;
  variants: ShopifyVariant[];
  images: { src: string }[];
  body_html: string;
  tags: string;
  metafields_global_title_tag?: string;
  metafields_global_description_tag?: string;
}

export interface ShopifyVariant {
  id: string;
  title: string;
  sku?: string;
  inventory_quantity: number;
  price: string;
  compareAtPrice?: string;
  inventory_management?: string;
  inventory_item_id?: string;
}

export interface ShopifyBlogArticle {
  id?: string;
  title: string;
  body_html: string;
  summary_html?: string;
  tags?: string;
  image?: { src: string; alt?: string };
  published?: boolean;
  published_at?: string;
  metafields?: { key: string; value: string; type: string; namespace: string }[];
}

export class ShopifyApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ShopifyApiError";
    this.status = status;
  }
}

const REQUEST_TIMEOUT_MS = 20_000;

// Shopify client-credentials tokens expire after ~24h. They were previously
// minted only at boot (server/seed.ts), so any run more than a day after the
// last redeploy hit 401s on every call — inventory scans, syncs, fulfillment
// all failed until someone happened to redeploy. This mints a fresh token
// on demand; single-flight so concurrent 401s don't stampede the OAuth
// endpoint (Shopify rate-limits it, and one fresh token serves everyone).
let tokenRefreshInFlight: Promise<string | null> | null = null;

async function refreshShopifyAccessToken(domain: string): Promise<string | null> {
  if (tokenRefreshInFlight) return tokenRefreshInFlight;
  tokenRefreshInFlight = (async () => {
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.warn("[Shopify] Token expired but SHOPIFY_CLIENT_ID/SECRET not set — cannot auto-refresh");
      return null;
    }
    try {
      const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      if (!res.ok) {
        console.warn(`[Shopify] Token auto-refresh failed (${res.status}): ${await res.text().catch(() => "")}`);
        return null;
      }
      const data = await res.json() as { access_token?: string };
      const token = data.access_token ?? null;
      if (token) {
        // Persist so future client constructions (and the next boot) start
        // from the fresh token instead of re-discovering the expiry.
        try {
          const { upsertShopifyConfig } = await import("./db");
          const { encryptCredential } = await import("./crypto");
          await upsertShopifyConfig({ storeDomain: domain, accessToken: encryptCredential(token), isConnected: true });
        } catch (persistErr) {
          console.warn("[Shopify] Refreshed token but failed to persist it:", persistErr);
        }
        console.log("[Shopify] Access token auto-refreshed after 401");
      }
      return token;
    } catch (err) {
      console.warn("[Shopify] Token auto-refresh request failed:", err);
      return null;
    } finally {
      // Release after settling so the NEXT expiry (tomorrow) can refresh again.
      setTimeout(() => { tokenRefreshInFlight = null; }, 0);
    }
  })();
  return tokenRefreshInFlight;
}

export class ShopifyClient {
  private domain: string;
  private token: string;
  private baseUrl: string;

  constructor(domain: string, token: string) {
    // Normalize domain
    this.domain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    this.token = token;
    this.baseUrl = `https://${this.domain}/admin/api/2024-01`;
  }

  private async requestOnceWithHeaders<T>(
    method: string,
    path: string,
    body?: unknown,
    isRetryAfterRefresh = false
  ): Promise<{ data: T; linkHeader: string | null }> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          "X-Shopify-Access-Token": this.token,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    // Expired token (24h client-credentials lifetime): mint a fresh one and
    // retry this request once. Without this, every automation failed with
    // 401s from ~a day after the last deploy until the next redeploy.
    if (res.status === 401 && !isRetryAfterRefresh) {
      const fresh = await refreshShopifyAccessToken(this.domain);
      if (fresh) {
        this.token = fresh;
        return this.requestOnceWithHeaders<T>(method, path, body, true);
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new ShopifyApiError(res.status, `Shopify API error ${res.status}: ${text}`);
      (err as any).response = { status: res.status, headers: { "retry-after": res.headers.get("retry-after") } };
      throw err;
    }

    return { data: (await res.json()) as T, linkHeader: res.headers.get("link") };
  }

  private async requestOnce<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    return (await this.requestOnceWithHeaders<T>(method, path, body)).data;
  }

  // Routed through withRateLimit so every Shopify call gets the shared
  // 2req/s spacing plus 429/5xx backoff — previously only some call sites
  // wrapped themselves individually, and most (including the fulfillment
  // engine's order loop) called request() raw with no rate limiting at all.
  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return withRateLimit(() => this.requestOnce<T>(method, path, body));
  }

  private requestWithHeaders<T>(method: string, path: string, body?: unknown): Promise<{ data: T; linkHeader: string | null }> {
    return withRateLimit(() => this.requestOnceWithHeaders<T>(method, path, body));
  }

  /**
   * Extracts the next-page cursor from Shopify's Link response header
   * (rel="next"). Shopify's REST pagination requires this exact opaque
   * token — a plain incrementing page number is NOT valid page_info and
   * gets rejected with a 400 "page_info invalid value" error.
   */
  private static parseNextPageInfo(linkHeader: string | null): string | undefined {
    if (!linkHeader) return undefined;
    const nextLink = linkHeader.split(",").find(part => part.includes('rel="next"'));
    if (!nextLink) return undefined;
    const match = nextLink.match(/page_info=([^&>]+)/);
    return match ? decodeURIComponent(match[1]) : undefined;
  }

  async testConnection(): Promise<{ shop: { name: string; domain: string; email: string } }> {
    return this.request("GET", "/shop.json");
  }

  async getProducts(limit = 50, pageInfo?: string): Promise<{ products: ShopifyProduct[] }> {
    const params = new URLSearchParams({ limit: String(limit), fields: "id,title,handle,status,variants,images,body_html,tags" });
    if (pageInfo) params.set("page_info", pageInfo);
    return this.request("GET", `/products.json?${params}`);
  }

  /** Same as getProducts, but also returns the real cursor for the next page (or undefined if this was the last page). */
  async getProductsPage(limit = 50, pageInfo?: string): Promise<{ products: ShopifyProduct[]; nextPageInfo?: string }> {
    const params = new URLSearchParams({ limit: String(limit), fields: "id,title,handle,status,variants,images,body_html,tags" });
    if (pageInfo) params.set("page_info", pageInfo);
    const { data, linkHeader } = await this.requestWithHeaders<{ products: ShopifyProduct[] }>("GET", `/products.json?${params}`);
    return { products: data.products, nextPageInfo: ShopifyClient.parseNextPageInfo(linkHeader) };
  }

  /** Fetches every product in the store, paginating past Shopify's per-request limit. */
  async getAllProducts(pageSize = 250): Promise<ShopifyProduct[]> {
    const all: ShopifyProduct[] = [];
    let pageInfo: string | undefined;
    for (let i = 0; i < 100; i++) {
      const { products, nextPageInfo } = await this.getProductsPage(pageSize, pageInfo);
      all.push(...products);
      if (!nextPageInfo || products.length < pageSize) break;
      pageInfo = nextPageInfo;
    }
    return all;
  }

  async getProductCount(): Promise<{ count: number }> {
    return this.request("GET", "/products/count.json");
  }

  async updateProduct(productId: string, data: Partial<ShopifyProduct>): Promise<{ product: ShopifyProduct }> {
    return this.request("PUT", `/products/${productId}.json`, { product: data });
  }

  async createProduct(data: Partial<ShopifyProduct>): Promise<{ product: ShopifyProduct }> {
    return this.request("POST", "/products.json", { product: data });
  }

  async getVariant(variantId: string): Promise<{ variant: ShopifyVariant }> {
    return this.request("GET", `/variants/${variantId}.json`);
  }

  async setInventoryLevel(inventoryItemId: string, locationId: string, available: number): Promise<unknown> {
    return this.request("POST", "/inventory_levels/set.json", {
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      available,
    });
  }

  async getLocations(): Promise<{ locations: { id: string; name: string }[] }> {
    return this.request("GET", "/locations.json");
  }

  async getBlogs(): Promise<{ blogs: { id: string; title: string }[] }> {
    return this.request("GET", "/blogs.json");
  }

  async createArticle(blogId: string, article: ShopifyBlogArticle): Promise<{ article: ShopifyBlogArticle & { id: string } }> {
    return this.request("POST", `/blogs/${blogId}/articles.json`, { article });
  }

  async updateArticle(blogId: string, articleId: string, article: Partial<ShopifyBlogArticle>): Promise<{ article: ShopifyBlogArticle }> {
    return this.request("PUT", `/blogs/${blogId}/articles/${articleId}.json`, { article });
  }

  async getOrders(limit = 250, status = "any"): Promise<{ orders: any[] }> {
    return this.request("GET", `/orders.json?status=${status}&limit=${limit}&financial_status=paid`);
  }

  /** Replace the full tags string on an order (Shopify stores tags as one comma-separated string). */
  async updateOrderTags(orderId: string, tags: string): Promise<{ order: any }> {
    return this.request("PUT", `/orders/${orderId}.json`, { order: { id: orderId, tags } });
  }

  /** Fulfillment orders for an order — required by the modern fulfillment API. */
  async getFulfillmentOrders(orderId: string): Promise<{ fulfillment_orders: any[] }> {
    return this.request("GET", `/orders/${orderId}/fulfillment_orders.json`);
  }

  /** Create a fulfillment with tracking info; notifies the customer when notify=true. */
  async createFulfillment(
    fulfillmentOrderIds: (string | number)[],
    trackingNumber: string,
    trackingCompany: string,
    notifyCustomer = true
  ): Promise<{ fulfillment: any }> {
    return this.request("POST", "/fulfillments.json", {
      fulfillment: {
        line_items_by_fulfillment_order: fulfillmentOrderIds.map(id => ({ fulfillment_order_id: id })),
        tracking_info: { number: trackingNumber, company: trackingCompany },
        notify_customer: notifyCustomer,
      },
    });
  }

  async getCustomers(limit = 250, pageInfo?: string): Promise<{ customers: Array<{
    id: number;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    accepts_marketing: boolean;
    orders_count: number;
    tags: string;
  }> }> {
    const params = new URLSearchParams({
      limit: String(limit),
      fields: "id,email,first_name,last_name,accepts_marketing,orders_count,tags",
    });
    if (pageInfo) params.set("page_info", pageInfo);
    return this.request("GET", `/customers.json?${params}`);
  }

  async updateProductMetafields(productId: string, metafields: { key: string; value: string; type: string; namespace: string }[]): Promise<unknown> {
    // Shopify requires individual metafield updates
    const results = await Promise.allSettled(
      metafields.map((mf) =>
        this.request("POST", `/products/${productId}/metafields.json`, { metafield: mf })
      )
    );
    return results;
  }
}

export async function getShopifyClient(domain: string, token: string): Promise<ShopifyClient> {
  return new ShopifyClient(domain, token);
}
