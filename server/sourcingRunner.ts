/**
 * Shared product-sourcing logic — used by both the manual `runScrape` tRPC
 * mutation and the autonomous `/api/scheduled/product-sourcing` route.
 *
 * CJ Dropshipping has a real, accessible product-search API. When connected
 * this pulls real listings using a 2-step auth (email+apiKey → accessToken).
 * DSers and AliExpress don't offer a product search API to regular sellers,
 * so for those — and for CJ when it isn't connected — this falls back to
 * AI-generated candidate ideas, explicitly marked `isVerified: false`.
 */
import { invokeLLM } from "./_core/llm";
import { searchCjProducts, getCjAccessToken } from "./_core/cjDropshipping";
import { decryptCredentials } from "./crypto";
import { sleep } from "./rateLimiter";
import {
  getSourcingSpecs,
  updateSourcingSpec,
  getSourcingAppCredential,
  insertSourcedProducts,
} from "./db";

export async function runSourcingScrape(specId: number): Promise<{ count: number; verifiedCount: number }> {
  const specs = await getSourcingSpecs();
  const spec = specs.find((s) => s.id === specId);
  if (!spec) throw new Error("Spec not found");

  await updateSourcingSpec(specId, { status: "running" });
  try {
    const sources = (spec.sources as string[]) || ["dsers"];
    const keywords = (spec.keywords as string[]) || [];
    let products: any[] = [];

    if (sources.includes("cj")) {
      const cjCred = await getSourcingAppCredential("cj");
      // apiKey is the CJ API key; apiSecret is the CJ account email
      const rawApiKey = cjCred?.apiKey ? decryptCredentials({ apiKey: cjCred.apiKey }).apiKey : null;
      const cjEmail = cjCred?.apiSecret ?? null;

      let cjToken: string | null = null;
      if (rawApiKey && cjEmail) {
        cjToken = await getCjAccessToken(cjEmail, rawApiKey);
        if (!cjToken) {
          console.warn("[Sourcing] CJ auth failed — falling back to AI for CJ source");
        }
      }

      if (cjToken) {
        for (const keyword of keywords.slice(0, 5)) {
          try {
            const cjProducts = await searchCjProducts(cjToken, {
              keyword,
              minPrice: spec.minPrice ?? undefined,
              maxPrice: spec.maxPrice ?? undefined,
              pageSize: 20,
            });
            products.push(...cjProducts.map(p => ({
              ...p,
              specId,
              source: "cj" as const,
              rating: null,
              orders: null,
              shippingTime: null,
              shippingDays: null,
              aiScore: null,
              aiScoreReason: "Live CJ Dropshipping listing (real inventory, not AI-generated)",
              isVerified: true,
            })));
            await sleep(300);
          } catch (err: any) {
            console.warn(`[Sourcing] CJ search failed for "${keyword}":`, err.message);
          }
        }
      }
    }

    const needsAiFallback = sources.some(s => s === "dsers" || s === "aliexpress") || (sources.includes("cj") && !products.some(p => p.source === "cj"));
    if (needsAiFallback) {
      const aiSources = sources.filter(s => s !== "cj" || !products.some(p => p.source === "cj"));
      const sourceLabels: Record<string, string> = {
        dsers: "DSers (AliExpress dropshipping products)",
        cj: "CJ Dropshipping",
        aliexpress: "AliExpress (direct listings, sourced via DSers integration)",
      };
      const sourceDescriptions = aiSources.map((s) => sourceLabels[s] || s).join(", ");
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a dropshipping product research assistant generating CANDIDATE IDEAS for ${sourceDescriptions} — not real, verified inventory (there is no accessible product-search API for these sources). Be clear these are estimates for brainstorming, not live listings. Focus on home decor and lifestyle products. Return only valid JSON.`,
          },
          {
            role: "user",
            content: `Suggest dropshipping product ideas for: keywords=${JSON.stringify(keywords)}, categories=${JSON.stringify(spec.categories || [])}, minPrice=${spec.minPrice || 5}, maxPrice=${spec.maxPrice || 100}, minRating=${spec.minRating || 4.0}, minOrders=${spec.minOrders || 100}, maxShippingDays=${spec.maxShippingDays || 15}, sources=${JSON.stringify(aiSources)}. Generate 12-18 plausible product ideas spread across the requested sources. For aliexpress source, use "aliexpress" as the source field. Return JSON: { "products": [{ "source": "dsers"|"cj"|"aliexpress", "externalId": string, "title": string, "description": string, "price": number, "compareAtPrice": number, "imageUrl": string, "rating": number, "orders": number, "category": string, "supplier": string, "shippingTime": string, "shippingDays": number, "stockLevel": number, "aiScore": number, "aiScoreReason": string }] }`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "sourcing_results",
            strict: true,
            schema: {
              type: "object",
              properties: {
                products: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      source: { type: "string" },
                      externalId: { type: "string" },
                      title: { type: "string" },
                      description: { type: "string" },
                      price: { type: "number" },
                      compareAtPrice: { type: "number" },
                      imageUrl: { type: "string" },
                      rating: { type: "number" },
                      orders: { type: "number" },
                      category: { type: "string" },
                      supplier: { type: "string" },
                      shippingTime: { type: "string" },
                      shippingDays: { type: "number" },
                      stockLevel: { type: "number" },
                      aiScore: { type: "number" },
                      aiScoreReason: { type: "string" },
                    },
                    required: ["source", "externalId", "title", "description", "price", "compareAtPrice", "imageUrl", "rating", "orders", "category", "supplier", "shippingTime", "shippingDays", "stockLevel", "aiScore", "aiScoreReason"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["products"],
              additionalProperties: false,
            },
          },
        },
      });
      const scrapeRaw = response.choices[0]?.message?.content;
      const parsed = JSON.parse(typeof scrapeRaw === "string" ? scrapeRaw : "{}");
      const aiProducts = (parsed.products || []).map((p: any) => ({
        ...p,
        specId,
        isVerified: false,
        aiScoreReason: `AI-generated idea, not live inventory: ${p.aiScoreReason}`,
      }));
      products.push(...aiProducts);
    }

    if (spec.maxShippingDays) products = products.filter((p: any) => !p.shippingDays || p.shippingDays <= (spec.maxShippingDays as number));
    if (spec.minStockLevel) products = products.filter((p: any) => !p.stockLevel || p.stockLevel >= (spec.minStockLevel as number));
    const sorted = [...products].sort((a: any, b: any) => (b.isVerified ? 1 : 0) - (a.isVerified ? 1 : 0) || (b.aiScore || 0) - (a.aiScore || 0));
    const bestPickIds = new Set(sorted.slice(0, 3).map((p: any) => p.externalId));
    products = products.map((p: any) => ({ ...p, isBestPick: bestPickIds.has(p.externalId) }));
    await insertSourcedProducts(products);
    await updateSourcingSpec(specId, { status: "completed", lastRunAt: new Date(), resultCount: products.length });
    const verifiedCount = products.filter((p: any) => p.isVerified).length;
    return { count: products.length, verifiedCount };
  } catch (err) {
    await updateSourcingSpec(specId, { status: "error" });
    throw err;
  }
}
