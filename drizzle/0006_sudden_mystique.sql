CREATE TABLE `audit_fix_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`auditRunId` int NOT NULL,
	`issueId` int NOT NULL,
	`pageType` varchar(64),
	`pageId` varchar(128),
	`pageTitle` text,
	`fieldChanged` varchar(128) NOT NULL,
	`oldValue` text,
	`newValue` text,
	`fixType` varchar(64),
	`appliedAt` timestamp NOT NULL DEFAULT (now()),
	`status` enum('applied','failed','rolled_back') NOT NULL DEFAULT 'applied',
	`errorMessage` text,
	CONSTRAINT `audit_fix_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bulk_optimization_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`status` enum('pending','running','completed','cancelled','failed') NOT NULL DEFAULT 'pending',
	`totalProducts` int NOT NULL DEFAULT 0,
	`completedProducts` int NOT NULL DEFAULT 0,
	`errorCount` int NOT NULL DEFAULT 0,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bulk_optimization_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `optimization_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`shopifyProductId` varchar(64) NOT NULL,
	`originalTitle` text,
	`originalDescription` text,
	`originalMetaTitle` text,
	`originalMetaDescription` text,
	`optimizedTitle` text,
	`optimizedDescription` text,
	`metaTitle` varchar(70),
	`metaDescription` varchar(170),
	`status` enum('pending','processing','completed','failed','skipped') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `optimization_queue_id` PRIMARY KEY(`id`)
);
