/**
 * Shopify REST API Rate Limiter
 *
 * Shopify enforces a 2 requests/second leaky-bucket limit on REST Admin API calls.
 * Each shop gets 40 credits; each call costs 1 credit; credits refill at 2/sec.
 *
 * Strategy:
 *  - Space calls 500ms apart (≤ 2 req/s)
 *  - On 429 (Too Many Requests): exponential backoff starting at 1s, max 32s
 *  - On 5xx: retry up to 3 times with 2s delay
 *  - Track the Retry-After header when present
 */

const CALL_INTERVAL_MS = 550; // slightly over 500ms to stay safely under 2 req/s
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 32000;

let lastCallTime = 0;

/** Sleep for a given number of milliseconds */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a Shopify API call with rate limiting and retry logic.
 * Wraps any async function that calls the Shopify API.
 */
export async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  // Enforce minimum interval between calls
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < CALL_INTERVAL_MS) {
    await sleep(CALL_INTERVAL_MS - elapsed);
  }

  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    lastCallTime = Date.now();
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.response?.status ?? err?.status ?? 0;
      const retryAfter = err?.response?.headers?.["retry-after"];

      if (status === 429) {
        // Rate limited — use Retry-After header or exponential backoff
        const backoff = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
        console.warn(`[RateLimit] 429 received. Waiting ${backoff}ms before retry ${attempt + 1}/${MAX_RETRIES}`);
        await sleep(backoff);
        attempt++;
        continue;
      }

      if (status >= 500 && attempt < 3) {
        // Server error — retry with fixed delay
        console.warn(`[RateLimit] ${status} server error. Retrying in 2s (attempt ${attempt + 1})`);
        await sleep(2000);
        attempt++;
        continue;
      }

      // Non-retryable error
      throw err;
    }
  }

  throw new Error(`[RateLimit] Max retries (${MAX_RETRIES}) exceeded`);
}

/**
 * Process an array of items in batches with rate limiting.
 * Processes BATCH_SIZE items concurrently, then waits before next batch.
 *
 * @param items - Array of items to process
 * @param batchSize - How many to process concurrently (default: 1 for Shopify safety)
 * @param processFn - Async function to call for each item
 * @param onProgress - Optional callback called after each item completes
 */
export async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processFn: (item: T, index: number) => Promise<R>,
  onProgress?: (completed: number, total: number, result: R | null, error: Error | null) => void
): Promise<{ results: (R | null)[]; errors: Error[] }> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  const errors: Error[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchPromises = batch.map(async (item, batchIdx) => {
      const globalIdx = i + batchIdx;
      try {
        const result = await withRateLimit(() => processFn(item, globalIdx));
        results[globalIdx] = result;
        onProgress?.(globalIdx + 1, items.length, result, null);
      } catch (err: any) {
        errors.push(err);
        onProgress?.(globalIdx + 1, items.length, null, err);
      }
    });
    await Promise.all(batchPromises);
  }

  return { results, errors };
}
