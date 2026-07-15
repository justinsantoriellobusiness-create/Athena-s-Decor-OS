ALTER TABLE `email_campaigns` ADD `abTestEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `email_campaigns` ADD `variantBSubject` varchar(512);--> statement-breakpoint
ALTER TABLE `email_events` ADD `variant` varchar(1);