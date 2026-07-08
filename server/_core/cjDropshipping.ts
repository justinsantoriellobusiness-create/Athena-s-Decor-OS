/**
 * CJ Dropshipping API client.
 * CJ uses a two-step auth: POST email+apiKey → get accessToken → use in calls.
 * https://developers.cjdropshipping.com
 */

const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

export type CjProduct = {
  externalId: string;
  title: string;
  description: string;
  price: number;
  compareAtPrice: number;
  imageUrl: string;
  category: string;
  supplier: string;
  stockLevel: number;
};

export type CjVariant = {
  vid: string;
  variantSku?: string;
  variantNameEn?: string;
  variantSellPrice?: number;
};

function parsePrice(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return 0;
  // CJ sometimes returns a range like "12.34--15.67" — use the low end.
  const first = raw.split("--")[0];
  const n = parseFloat(first);
  return Number.isFinite(n) ? n : 0;
}

// In-memory token cache. CJ tokens last ~24h; re-authenticating on every
// sourcing scrape and every 30-min fulfillment tick both wastes calls and
// risks tripping CJ's auth-endpoint rate limit before the product/order
// limits. Cache for 23h to stay safely inside the real expiry.
const TOKEN_TTL_MS = 23 * 3600 * 1000;
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Authenticate with CJ Dropshipping to get an access token (cached ~23h).
 * The "password" field is the CJ API key (not a user password).
 */
export async function getCjAccessToken(email: string, apiKey: string): Promise<string | null> {
  const cacheKey = `${email}:${apiKey}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  try {
    const res = await fetch(`${CJ_BASE}/authentication/getAccessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: apiKey }),
    });
    if (!res.ok) {
      console.warn(`[CJ] Auth failed (${res.status})`);
      return null;
    }
    const data = await res.json() as { code: number; message?: string; data?: { accessToken?: string } };
    if (data.code !== 200) {
      console.warn(`[CJ] Auth error: ${data.message}`);
      return null;
    }
    const token = data.data?.accessToken ?? null;
    if (token) tokenCache.set(cacheKey, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
    return token;
  } catch (err) {
    console.warn("[CJ] Auth request failed:", err);
    return null;
  }
}

/** Clears a cached token (call on a 401 so the next request re-authenticates). */
export function invalidateCjToken(email: string, apiKey: string) {
  tokenCache.delete(`${email}:${apiKey}`);
}

export async function searchCjProducts(
  accessToken: string,
  params: { keyword: string; minPrice?: number; maxPrice?: number; pageSize?: number },
): Promise<CjProduct[]> {
  const url = new URL(`${CJ_BASE}/product/list`);
  url.searchParams.set("productNameEn", params.keyword);
  url.searchParams.set("pageNum", "1");
  url.searchParams.set("pageSize", String(Math.min(params.pageSize ?? 20, 50)));

  const res = await fetch(url, {
    headers: { "CJ-Access-Token": accessToken },
  });
  if (!res.ok) {
    throw new Error(`CJ product search failed (${res.status})`);
  }
  const data = (await res.json()) as { code: number; message?: string; data?: { list?: any[] } };
  if (data.code !== 200) {
    throw new Error(data.message || "CJ API returned an error");
  }

  const list = data.data?.list ?? [];
  const products: CjProduct[] = list.map((item: any) => {
    const price = parsePrice(item.sellPrice);
    return {
      externalId: String(item.pid ?? item.productId ?? item.id ?? ""),
      title: item.productNameEn ?? item.productName ?? "Untitled product",
      description: item.productNameEn ?? "",
      price,
      compareAtPrice: Math.round(price * 1.4 * 100) / 100,
      imageUrl: item.productImage ?? item.bigImage ?? "",
      category: item.categoryName ?? "",
      supplier: "CJ Dropshipping",
      stockLevel: typeof item.listedNum === "number" ? item.listedNum : 0,
    };
  });

  return products.filter(p => p.externalId && p.title !== "Untitled product").filter(p => {
    if (params.minPrice !== undefined && p.price < params.minPrice) return false;
    if (params.maxPrice !== undefined && p.price > params.maxPrice) return false;
    return true;
  });
}

/** Fetch the variants of a CJ product (needed to place orders — CJ orders use variant IDs). */
export async function getCjProductVariants(accessToken: string, pid: string): Promise<CjVariant[]> {
  const url = new URL(`${CJ_BASE}/product/variant/query`);
  url.searchParams.set("pid", pid);
  const res = await fetch(url, { headers: { "CJ-Access-Token": accessToken } });
  if (!res.ok) throw new Error(`CJ variant query failed (${res.status})`);
  const data = await res.json() as { code: number; message?: string; data?: any[] };
  if (data.code !== 200) throw new Error(data.message || "CJ variant query error");
  return (data.data ?? []).map((v: any) => ({
    vid: String(v.vid ?? v.variantId ?? ""),
    variantSku: v.variantSku ?? undefined,
    variantNameEn: v.variantNameEn ?? undefined,
    variantSellPrice: typeof v.variantSellPrice === "number" ? v.variantSellPrice : undefined,
  })).filter((v: CjVariant) => v.vid);
}

export type CjOrderInput = {
  orderNumber: string;
  shippingCustomerName: string;
  shippingCountryCode: string;
  shippingProvince: string;
  shippingCity: string;
  shippingAddress: string;
  shippingZip: string;
  shippingPhone: string;
  email?: string;
  remark?: string;
  products: { vid: string; quantity: number }[];
};

/**
 * Place a real order with CJ Dropshipping. Returns the CJ order ID on success.
 * NOTE: this spends real money from the connected CJ account balance.
 * orderNumber is passed as CJ's client-side order reference; combined with
 * the fulfillment engine's DB run-lock and Shopify idempotency tag, this
 * guards against double-ordering.
 */
export async function createCjOrder(accessToken: string, order: CjOrderInput): Promise<string | null> {
  const res = await fetch(`${CJ_BASE}/shopping/order/createOrderV2`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CJ-Access-Token": accessToken },
    body: JSON.stringify({
      orderNumber: order.orderNumber,
      shippingCustomerName: order.shippingCustomerName,
      shippingCountryCode: order.shippingCountryCode,
      shippingProvince: order.shippingProvince,
      shippingCity: order.shippingCity,
      shippingAddress: order.shippingAddress,
      shippingZip: order.shippingZip,
      shippingPhone: order.shippingPhone,
      email: order.email,
      remark: order.remark ?? "Auto-placed by Athena's Decor OS",
      payType: 2, // pay from CJ wallet balance
      products: order.products,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CJ createOrder failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const data = await res.json() as { code: number; message?: string; data?: any };
  if (data.code !== 200) {
    throw new Error(data.message || "CJ createOrder returned an error");
  }
  const d = data.data;
  if (typeof d === "string") return d;
  return d?.orderId ? String(d.orderId) : null;
}

export type CjOrderStatus = {
  orderStatus?: string;
  trackNumber?: string;
  logisticName?: string;
  authError?: boolean;
};

/**
 * Query a CJ order for its current status and tracking number (if shipped).
 * Distinguishes an auth/network failure (authError:true) from "no tracking
 * yet" so the caller can surface an expired-token problem instead of
 * silently treating it as still-processing forever.
 */
export async function getCjOrderStatus(accessToken: string, cjOrderId: string): Promise<CjOrderStatus | null> {
  const url = new URL(`${CJ_BASE}/shopping/order/getOrderDetail`);
  url.searchParams.set("orderId", cjOrderId);
  let res: Response;
  try {
    res = await fetch(url, { headers: { "CJ-Access-Token": accessToken } });
  } catch {
    return { authError: true };
  }
  if (res.status === 401 || res.status === 403) return { authError: true };
  if (!res.ok) return null;
  const data = await res.json() as { code: number; data?: any };
  if (data.code !== 200 || !data.data) return null;
  return {
    orderStatus: data.data.orderStatus ?? undefined,
    trackNumber: data.data.trackNumber ?? undefined,
    logisticName: data.data.logisticName ?? undefined,
  };
}
