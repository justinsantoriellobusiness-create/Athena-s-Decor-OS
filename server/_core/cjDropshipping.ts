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

/**
 * Authenticate with CJ Dropshipping to get an access token.
 * The "password" field is the CJ API key (not a user password).
 * Tokens are valid for ~24h.
 */
export async function getCjAccessToken(email: string, apiKey: string): Promise<string | null> {
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
    return data.data?.accessToken ?? null;
  } catch (err) {
    console.warn("[CJ] Auth request failed:", err);
    return null;
  }
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
    const text = await res.text();
    throw new Error(`CJ createOrder failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json() as { code: number; message?: string; data?: any };
  if (data.code !== 200) {
    throw new Error(data.message || "CJ createOrder returned an error");
  }
  // API returns either the order id string directly or an object containing it
  const d = data.data;
  if (typeof d === "string") return d;
  return d?.orderId ? String(d.orderId) : null;
}

export type CjOrderStatus = {
  orderStatus?: string;
  trackNumber?: string;
  logisticName?: string;
};

/** Query a CJ order for its current status and tracking number (if shipped). */
export async function getCjOrderStatus(accessToken: string, cjOrderId: string): Promise<CjOrderStatus | null> {
  const url = new URL(`${CJ_BASE}/shopping/order/getOrderDetail`);
  url.searchParams.set("orderId", cjOrderId);
  const res = await fetch(url, { headers: { "CJ-Access-Token": accessToken } });
  if (!res.ok) return null;
  const data = await res.json() as { code: number; data?: any };
  if (data.code !== 200 || !data.data) return null;
  return {
    orderStatus: data.data.orderStatus ?? undefined,
    trackNumber: data.data.trackNumber ?? undefined,
    logisticName: data.data.logisticName ?? undefined,
  };
}
