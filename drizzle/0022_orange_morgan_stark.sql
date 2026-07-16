ALTER TABLE `users` ADD `avatarUrl` text;--> statement-breakpoint
ALTER TABLE `users` ADD `themePreset` varchar(32) DEFAULT 'gold' NOT NULL;