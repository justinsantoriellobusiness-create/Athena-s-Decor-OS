CREATE TABLE `backlink_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`targetUrl` text NOT NULL,
	`anchorText` varchar(255),
	`keywords` text,
	`niche` varchar(128),
	`status` enum('active','paused','completed') NOT NULL DEFAULT 'active',
	`automationEnabled` boolean NOT NULL DEFAULT false,
	`frequencyDays` int NOT NULL DEFAULT 7,
	`lastRunAt` timestamp,
	`nextRunAt` timestamp,
	`totalLinksFound` int NOT NULL DEFAULT 0,
	`totalOutreachSent` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `backlink_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `backlink_opportunities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`userId` int NOT NULL,
	`siteUrl` text NOT NULL,
	`siteName` varchar(255),
	`pageTitle` text,
	`pageUrl` text NOT NULL,
	`domainAuthority` int DEFAULT 0,
	`relevanceScore` int DEFAULT 0,
	`seoValue` enum('high','medium','low') DEFAULT 'medium',
	`type` enum('news','blog','forum','directory','social','competitor') DEFAULT 'blog',
	`status` enum('new','outreach_sent','linked','rejected','pending') NOT NULL DEFAULT 'new',
	`outreachEmail` varchar(255),
	`outreachMessage` text,
	`outreachSentAt` timestamp,
	`linkedAt` timestamp,
	`notes` text,
	`discoveredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `backlink_opportunities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`subject` varchar(512) NOT NULL,
	`previewText` varchar(255),
	`bodyHtml` text,
	`bodyText` text,
	`fromName` varchar(128),
	`fromEmail` varchar(255),
	`replyTo` varchar(255),
	`type` enum('promotional','newsletter','drip','winback','abandoned_cart','welcome') NOT NULL DEFAULT 'promotional',
	`status` enum('draft','scheduled','sending','sent','paused') NOT NULL DEFAULT 'draft',
	`scheduledAt` timestamp,
	`sentAt` timestamp,
	`automationEnabled` boolean NOT NULL DEFAULT false,
	`frequencyDays` int DEFAULT 30,
	`nextSendAt` timestamp,
	`totalRecipients` int NOT NULL DEFAULT 0,
	`totalSent` int NOT NULL DEFAULT 0,
	`totalDelivered` int NOT NULL DEFAULT 0,
	`totalOpened` int NOT NULL DEFAULT 0,
	`totalClicked` int NOT NULL DEFAULT 0,
	`totalBounced` int NOT NULL DEFAULT 0,
	`totalUnsubscribed` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`prospectId` int NOT NULL,
	`userId` int NOT NULL,
	`event` enum('sent','delivered','opened','clicked','bounced','unsubscribed','spam') NOT NULL,
	`clickUrl` text,
	`userAgent` text,
	`ipAddress` varchar(64),
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_prospects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`email` varchar(255) NOT NULL,
	`firstName` varchar(128),
	`lastName` varchar(128),
	`company` varchar(255),
	`website` varchar(512),
	`source` enum('competitor_scrape','manual','shopify_customer','form_signup','import') NOT NULL DEFAULT 'manual',
	`sourceDetail` varchar(255),
	`tags` text,
	`status` enum('active','unsubscribed','bounced','spam') NOT NULL DEFAULT 'active',
	`score` int DEFAULT 50,
	`lastContactedAt` timestamp,
	`addedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_prospects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `integration_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`platform` enum('shopify','ebay','paypal','google','facebook','tiktok','autods','cj_dropshipping') NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`tokenExpiry` timestamp,
	`shopDomain` varchar(255),
	`scopes` text,
	`metadata` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`connectedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `integration_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prospect_scrap_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`competitorDomain` varchar(255) NOT NULL,
	`method` enum('social_followers','review_sites','blog_comments','forum_posts','linkedin') NOT NULL DEFAULT 'review_sites',
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`prospectsFound` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prospect_scrap_jobs_id` PRIMARY KEY(`id`)
);
