CREATE TABLE `app_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appName` varchar(120),
	`logoUrl` text,
	`themeId` varchar(32) NOT NULL DEFAULT 'violet',
	`businessName` varchar(255),
	`niche` varchar(255),
	`targetAudience` text,
	`brandVoice` text,
	`priceTier` enum('budget','mid_range','premium','luxury'),
	`keyCategories` text,
	`competitors` text,
	`uniqueValue` text,
	`website` varchar(255),
	`additionalNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`)
);
