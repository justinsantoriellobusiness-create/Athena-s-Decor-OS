/**
 * Firecrawl web search — used by the backlinker to find real, live sites
 * instead of having the LLM invent plausible-sounding names/URLs.
 * https://docs.firecrawl.dev/features/search
 */
const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v1/search";

export function isFirecrawlConfigured(): boolean {
  return !!process.env.FIRECRAWL_API_KEY;
}

export interface FirecrawlSearchResult {
  title: string;
  url: string;
  description?: string;
}

export async function firecrawlSearch(query: string, limit = 10): Promise<FirecrawlSearchResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not configured");

  const res = await fetch(FIRECRAWL_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, limit }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Firecrawl search failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { success?: boolean; data?: Array<{ title?: string; url?: string; description?: string }> };
  if (!data.success) throw new Error("Firecrawl search returned an error");
  return (data.data || [])
    .filter((r) => !!r.url)
    .map((r) => ({ title: r.title || r.url!, url: r.url!, description: r.description }));
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Runs several targeted queries and returns deduped real results (one per
 * domain), capped at `limit`. Multiple queries cover different angles
 * (general niche sites, guest-post-friendly sites, "best of" roundups)
 * since a single query rarely surfaces enough distinct, relevant domains.
 */
export async function searchRealBacklinkCandidates(niche: string, limit: number): Promise<FirecrawlSearchResult[]> {
  const queries = [
    `${niche} blog`,
    `${niche} write for us`,
    `best ${niche} blogs`,
  ];
  const seen = new Map<string, FirecrawlSearchResult>();
  for (const q of queries) {
    if (seen.size >= limit) break;
    try {
      const results = await firecrawlSearch(q, Math.min(limit, 10));
      for (const r of results) {
        const domain = getDomain(r.url);
        if (!seen.has(domain)) seen.set(domain, r);
      }
    } catch (err) {
      console.warn(`[Firecrawl] Search failed for "${q}":`, err);
    }
  }
  return Array.from(seen.values()).slice(0, limit);
}
