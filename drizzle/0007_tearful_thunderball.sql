CREATE TABLE `sourcing_app_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`app` enum('autods','cj') NOT NULL,
	`apiKey` varchar(512),
	`apiSecret` varchar(512),
	`storeId` varchar(255),
	`accessToken` varchar(512),
	`isConnected` boolean NOT NULL DEFAULT false,
	`lastTestedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sourcing_app_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `sourcing_app_credentials_app_unique` UNIQUE(`app`)
);
--> statement-breakpoint
ALTER TABLE `sourced_products` MODIFY COLUMN `source` enum('dsers','cj','aliexpress') NOT NULL;--> statement-breakpoint
ALTER TABLE `sourcing_specs` ADD `autoOptimizeBeforeImport` boolean DEFAULT false;