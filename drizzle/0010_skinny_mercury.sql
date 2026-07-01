ALTER TABLE `inventory_snapshots` ADD `supplierName` varchar(255);--> statement-breakpoint
ALTER TABLE `inventory_snapshots` ADD `supplierSource` enum('dsers','cj','aliexpress','manual','unknown') DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE `inventory_snapshots` ADD `supplierProductId` varchar(255);--> statement-breakpoint
ALTER TABLE `inventory_snapshots` ADD `supplierPrice` float;--> statement-breakpoint
ALTER TABLE `inventory_snapshots` ADD `imageUrl` text;