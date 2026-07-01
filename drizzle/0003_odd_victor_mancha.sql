CREATE TABLE `site_audit_issues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`pageType` enum('product','collection','page','blog','article','homepage') NOT NULL,
	`pageId` varchar(128),
	`pageTitle` varchar(512),
	`pageUrl` text,
	`issueType` enum('missing_title','short_title','long_title','missing_meta','short_meta','long_meta','missing_alt','duplicate_content','thin_content','missing_h1','keyword_stuffing','low_readability','missing_schema','broken_link','slow_page','low_cro','weak_cta','poor_description') NOT NULL,
	`severity` enum('critical','warning','info') NOT NULL,
	`description` text,
	`suggestion` text,
	`currentValue` text,
	`suggestedValue` text,
	`status` enum('open','fixed','ignored','pending_fix') NOT NULL DEFAULT 'open',
	`fixAppliedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `site_audit_issues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `site_audit_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`status` enum('running','completed','error') NOT NULL DEFAULT 'running',
	`overallScore` int,
	`seoScore` int,
	`croScore` int,
	`technicalScore` int,
	`pageCount` int DEFAULT 0,
	`issueCount` int DEFAULT 0,
	`criticalCount` int DEFAULT 0,
	`warningCount` int DEFAULT 0,
	`infoCount` int DEFAULT 0,
	`summary` text,
	`errorMessage` text,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `site_audit_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `sourcing_specs` ADD `maxShippingDays` int;--> statement-breakpoint
ALTER TABLE `sourcing_specs` ADD `minStockLevel` int;