/**
 * DB helpers for bulk product optimization and audit fix log.
 * Kept separate to avoid bloating db.ts further.
 */
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "./db";
import {
  bulkOptimizationJobs,
  optimizationQueue,
  auditFixLog,
  type BulkOptimizationJob,
  type OptimizationQueueItem,
  type AuditFixLog,
} from "../drizzle/schema";

// ─── Bulk Optimization Jobs ───────────────────────────────────────────────────

export async function createOptimizationJob(totalProducts: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(bulkOptimizationJobs).values({
    status: "pending",
    totalProducts,
    completedProducts: 0,
    errorCount: 0,
    startedAt: new Date(),
  });
  return Number((result as any).insertId);
}

export async function getOptimizationJob(jobId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(bulkOptimizationJobs).where(eq(bulkOptimizationJobs.id, jobId)).limit(1);
  return rows[0] ?? null;
}

export async function getLatestOptimizationJob() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(bulkOptimizationJobs).orderBy(bulkOptimizationJobs.id).limit(1);
  // Get the most recent by fetching all and sorting (drizzle mysql doesn't have .orderBy desc easily without import)
  const all = await db.select().from(bulkOptimizationJobs);
  if (!all.length) return null;
  return all.sort((a, b) => b.id - a.id)[0];
}

export async function updateOptimizationJob(
  jobId: number,
  data: Partial<Pick<BulkOptimizationJob, "status" | "completedProducts" | "errorCount" | "completedAt">>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(bulkOptimizationJobs).set(data).where(eq(bulkOptimizationJobs.id, jobId));
}

// ─── Optimization Queue ───────────────────────────────────────────────────────

export async function insertOptimizationQueueItems(
  jobId: number,
  products: Array<{ shopifyProductId: string; originalTitle?: string; originalDescription?: string; originalMetaTitle?: string; originalMetaDescription?: string }>
) {
  const db = await getDb();
  if (!db) return;
  if (!products.length) return;
  // Insert in batches of 100
  const BATCH = 100;
  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    await db.insert(optimizationQueue).values(
      batch.map((p) => ({
        jobId,
        shopifyProductId: p.shopifyProductId,
        originalTitle: p.originalTitle ?? null,
        originalDescription: p.originalDescription ?? null,
        originalMetaTitle: p.originalMetaTitle ?? null,
        originalMetaDescription: p.originalMetaDescription ?? null,
        status: "pending" as const,
      }))
    );
  }
}

export async function getPendingQueueItems(jobId: number, limit: number) {
  const db = await getDb();
  if (!db) return [];
  const all = await db.select().from(optimizationQueue).where(
    and(eq(optimizationQueue.jobId, jobId), eq(optimizationQueue.status, "pending"))
  );
  return all.slice(0, limit);
}

export async function getQueueItemsForJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(optimizationQueue).where(eq(optimizationQueue.jobId, jobId));
}

export async function updateQueueItem(
  itemId: number,
  data: Partial<Pick<OptimizationQueueItem, "status" | "optimizedTitle" | "optimizedDescription" | "metaTitle" | "metaDescription" | "errorMessage" | "processedAt">>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(optimizationQueue).set(data).where(eq(optimizationQueue.id, itemId));
}

// ─── Audit Fix Log ────────────────────────────────────────────────────────────

export async function insertAuditFixLog(entry: {
  auditRunId: number;
  issueId: number;
  pageType?: string;
  pageId?: string;
  pageTitle?: string;
  fieldChanged: string;
  oldValue?: string;
  newValue?: string;
  fixType?: string;
  status?: "applied" | "failed" | "rolled_back";
  errorMessage?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditFixLog).values({
    auditRunId: entry.auditRunId,
    issueId: entry.issueId,
    pageType: entry.pageType ?? null,
    pageId: entry.pageId ?? null,
    pageTitle: entry.pageTitle ?? null,
    fieldChanged: entry.fieldChanged,
    oldValue: entry.oldValue ?? null,
    newValue: entry.newValue ?? null,
    fixType: entry.fixType ?? null,
    status: entry.status ?? "applied",
    errorMessage: entry.errorMessage ?? null,
    appliedAt: new Date(),
  });
}

export async function getAuditFixLog(auditRunId: number): Promise<AuditFixLog[]> {
  const db = await getDb();
  if (!db) return [];
  const all = await db.select().from(auditFixLog).where(eq(auditFixLog.auditRunId, auditRunId));
  return all.sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime());
}

export async function updateAuditFixLogStatus(
  logId: number,
  status: "applied" | "failed" | "rolled_back"
) {
  const db = await getDb();
  if (!db) return;
  await db.update(auditFixLog).set({ status }).where(eq(auditFixLog.id, logId));
}
