CREATE TABLE `ai_suggestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`module` varchar(64) NOT NULL,
	`actionType` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`reasoning` text NOT NULL,
	`actionPayload` json,
	`status` enum('pending','approved','denied','executed','failed') NOT NULL DEFAULT 'pending',
	`resultMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `ai_suggestions_id` PRIMARY KEY(`id`)
);
