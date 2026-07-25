ALTER TABLE `users` ADD `pinHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `pinEnabled` boolean DEFAULT false NOT NULL;