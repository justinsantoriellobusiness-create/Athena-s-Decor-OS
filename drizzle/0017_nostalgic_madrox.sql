-- Before the migration bug fix, upsertInventorySnapshot's onDuplicateKeyUpdate
-- silently never fired (no unique key existed), so every inventory scan
-- inserted a fresh row per variant instead of updating the existing one.
-- Clear out the resulting duplicates (keep only the newest row per variant)
-- before adding the unique constraint, so this migration doesn't fail on an
-- existing production database that already has piled-up duplicate rows.
DELETE t1 FROM `inventory_snapshots` t1
INNER JOIN `inventory_snapshots` t2
  ON t1.`shopifyVariantId` = t2.`shopifyVariantId`
  AND t1.`id` < t2.`id`
WHERE t1.`shopifyVariantId` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `inventory_snapshots` ADD CONSTRAINT `inventory_snapshots_shopifyVariantId_unique` UNIQUE(`shopifyVariantId`);
