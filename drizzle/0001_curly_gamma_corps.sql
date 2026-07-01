CREATE TABLE `ad_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`platform` enum('facebook','instagram','google','tiktok') NOT NULL,
	`status` enum('draft','active','paused','completed','error') NOT NULL DEFAULT 'draft',
	`objective` varchar(128),
	`dailyBudget` float,
	`totalBudget` float,
	`spent` float DEFAULT 0,
	`impressions` bigint DEFAULT 0,
	`clicks` bigint DEFAULT 0,
	`conversions` int DEFAULT 0,
	`roas` float DEFAULT 0,
	`ctr` float DEFAULT 0,
	`cpc` float DEFAULT 0,
	`targeting` json,
	`externalCampaignId` varchar(255),
	`startDate` timestamp,
	`endDate` timestamp,
	`lastOptimizedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ad_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ad_creatives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int,
	`type` enum('product_image','ugc','carousel','video_thumbnail') NOT NULL,
	`headline` varchar(255),
	`bodyText` text,
	`ctaText` varchar(128),
	`imageUrl` text,
	`imageKey` text,
	`sourceProductId` varchar(128),
	`sourceImageUrl` text,
	`aiPrompt` text,
	`status` enum('generating','ready','in_use','archived') NOT NULL DEFAULT 'generating',
	`performance` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ad_creatives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `automation_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`module` varchar(64) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`cronExpression` varchar(64) NOT NULL DEFAULT '0 0 9 * * *',
	`lastRunAt` timestamp,
	`nextRunAt` timestamp,
	`lastRunStatus` enum('idle','running','success','error') DEFAULT 'idle',
	`lastRunMessage` text,
	`taskUid` varchar(128),
	`config` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `automation_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `automation_settings_module_unique` UNIQUE(`module`)
);
--> statement-breakpoint
CREATE TABLE `blog_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(512) NOT NULL,
	`slug` varchar(512),
	`content` text,
	`excerpt` text,
	`featuredImageUrl` text,
	`featuredImageKey` text,
	`tags` json,
	`seoTitle` varchar(512),
	`seoDescription` text,
	`status` enum('draft','scheduled','published','failed') NOT NULL DEFAULT 'draft',
	`shopifyBlogId` varchar(128),
	`shopifyArticleId` varchar(128),
	`scheduledAt` timestamp,
	`publishedAt` timestamp,
	`generatedByAi` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `blog_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shopifyProductId` varchar(128) NOT NULL,
	`shopifyVariantId` varchar(128),
	`title` varchar(512),
	`sku` varchar(255),
	`supplierStock` int DEFAULT 0,
	`shopifyStock` int DEFAULT 0,
	`status` enum('in_stock','low_stock','out_of_stock','unknown') NOT NULL DEFAULT 'unknown',
	`autoUpdated` boolean DEFAULT false,
	`lastCheckedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seo_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('keyword_research','product_optimize','site_audit') NOT NULL,
	`status` enum('pending','running','success','error') NOT NULL DEFAULT 'pending',
	`targetId` varchar(128),
	`result` json,
	`errorMessage` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seo_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seo_keywords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyword` varchar(255) NOT NULL,
	`searchVolume` int DEFAULT 0,
	`difficulty` int DEFAULT 0,
	`cpc` float DEFAULT 0,
	`trend` enum('up','down','stable') DEFAULT 'stable',
	`category` varchar(128),
	`source` varchar(64) DEFAULT 'ai_research',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_keywords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shopify_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeDomain` varchar(255) NOT NULL,
	`accessToken` varchar(512) NOT NULL,
	`storefrontToken` varchar(512),
	`isConnected` boolean NOT NULL DEFAULT false,
	`lastSyncAt` timestamp,
	`productCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shopify_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sourced_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`specId` int NOT NULL,
	`source` enum('dsers','cj') NOT NULL,
	`externalId` varchar(255),
	`title` varchar(512) NOT NULL,
	`description` text,
	`price` float,
	`compareAtPrice` float,
	`imageUrl` text,
	`rating` float,
	`orders` int,
	`category` varchar(255),
	`supplier` varchar(255),
	`shippingTime` varchar(128),
	`variants` json,
	`importStatus` enum('pending','importing','imported','failed') NOT NULL DEFAULT 'pending',
	`shopifyProductId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sourced_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sourcing_specs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`keywords` json NOT NULL,
	`categories` json,
	`minPrice` float,
	`maxPrice` float,
	`minRating` float,
	`minOrders` int,
	`sources` json NOT NULL,
	`status` enum('idle','running','completed','error') NOT NULL DEFAULT 'idle',
	`lastRunAt` timestamp,
	`resultCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sourcing_specs_id` PRIMARY KEY(`id`)
);
