CREATE TABLE `activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`module` varchar(64) NOT NULL,
	`level` enum('info','success','warning','error') NOT NULL DEFAULT 'info',
	`title` varchar(255) NOT NULL,
	`detail` text,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_log_id` PRIMARY KEY(`id`)
);
