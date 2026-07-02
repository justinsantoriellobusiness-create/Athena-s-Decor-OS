/**
 * Real product search against CJ Dropshipping's public API, using the
 * access token saved via Sourcing → App Credentials (same token already
 * used to test the connection and push favorites elsewhere in this app).
 * https://developers.cjdropshipping.com
 */

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

function parsePrice(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return 0;
  // CJ sometimes returns a range like "12.34--15.67" — use the low end.
  const first = raw.split("--")[0];
  const n = parseFloat(first);
  return Number.isFinite(n) ? n : 0;
}

export async function searchCjProducts(
  accessToken: string,
  params: { keyword: string; minPrice?: number; maxPrice?: number; pageSize?: number },
): Promise<CjProduct[]> {
  const url = new URL("https://developers.cjdropshipping.com/api2.0/v1/product/list");
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
