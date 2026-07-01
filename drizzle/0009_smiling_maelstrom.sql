CREATE TABLE `autonomous_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`module` enum('email_scraper','email_campaigns','backlinker','blog') NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`frequencyHours` int NOT NULL DEFAULT 24,
	`lastAutoRunAt` timestamp,
	`nextAutoRunAt` timestamp,
	`config` json,
	`taskUid` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `autonomous_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaign_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`shopifyProductId` varchar(128) NOT NULL,
	`title` varchar(512) NOT NULL,
	`imageUrl` text,
	`productUrl` text,
	`price` varchar(64),
	`description` text,
	`position` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaign_products_id` PRIMARY KEY(`id`)
);
