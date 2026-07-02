/**
 * Shopify Admin API helper
 * All calls go through the Admin REST API using the stored access token.
 */

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

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "X-Shopify-Access-Token": this.token,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  async testConnection(): Promise<{ shop: { name: string; domain: string; email: string } }> {
    return this.request("GET", "/shop.json");
  }

  async getProducts(limit = 50, pageInfo?: string): Promise<{ products: ShopifyProduct[] }> {
    const params = new URLSearchParams({ limit: String(limit), fields: "id,title,handle,status,variants,images,body_html,tags" });
    if (pageInfo) params.set("page_info", pageInfo);
    return this.request("GET", `/products.json?${params}`);
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
