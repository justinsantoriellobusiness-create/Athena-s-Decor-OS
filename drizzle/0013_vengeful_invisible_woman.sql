CREATE TABLE `wix_analytics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	`visitors` int DEFAULT 0,
	`pageViews` int DEFAULT 0,
	`conversions` int DEFAULT 0,
	`revenue` varchar(64) DEFAULT '0',
	`averageOrderValue` varchar(64) DEFAULT '0',
	`conversionRate` varchar(64) DEFAULT '0',
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wix_analytics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wix_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountId` varchar(255) NOT NULL,
	`apiKey` text NOT NULL,
	`siteUrl` varchar(512) NOT NULL,
	`isConnected` boolean NOT NULL DEFAULT false,
	`productCount` int NOT NULL DEFAULT 0,
	`orderCount` int NOT NULL DEFAULT 0,
	`customerCount` int NOT NULL DEFAULT 0,
	`lastSyncAt` timestamp,
	`lastSyncStatus` enum('success','failed','pending') DEFAULT 'pending',
	`connectedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wix_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wix_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`wixId` varchar(255) NOT NULL,
	`customerId` varchar(255),
	`total` varchar(64) NOT NULL,
	`status` enum('pending','processing','completed','cancelled','refunded') NOT NULL DEFAULT 'pending',
	`items` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`syncedAt` timestamp,
	CONSTRAINT `wix_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wix_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`wixId` varchar(255) NOT NULL,
	`title` varchar(512) NOT NULL,
	`description` text,
	`price` varchar(64),
	`inventory` int DEFAULT 0,
	`imageUrl` text,
	`shopifyProductId` varchar(128),
	`lastSyncedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wix_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `zapier_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`apiKey` text NOT NULL,
	`isConnected` boolean NOT NULL DEFAULT false,
	`webhookUrl` text,
	`connectedPlatforms` text,
	`lastSyncAt` timestamp,
	`connectedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `zapier_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `zapier_webhooks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`zapId` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`trigger` varchar(128) NOT NULL,
	`action` varchar(128) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`lastTriggeredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `zapier_webhooks_id` PRIMARY KEY(`id`)
);
