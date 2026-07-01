ALTER TABLE `transactions` ADD `fingerprint` varchar(64);--> statement-breakpoint
ALTER TABLE `transactions` ADD `isDuplicate` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `duplicateOfId` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `duplicateReason` varchar(512);--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_fingerprint_unique` UNIQUE(`fingerprint`);