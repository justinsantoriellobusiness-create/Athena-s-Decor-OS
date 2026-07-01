ALTER TABLE `blog_posts` ADD `featuredImageAlt` text;--> statement-breakpoint
ALTER TABLE `sourced_products` ADD `shippingDays` int;--> statement-breakpoint
ALTER TABLE `sourced_products` ADD `stockLevel` int;--> statement-breakpoint
ALTER TABLE `sourced_products` ADD `aiScore` float;--> statement-breakpoint
ALTER TABLE `sourced_products` ADD `aiScoreReason` text;--> statement-breakpoint
ALTER TABLE `sourced_products` ADD `isBestPick` boolean DEFAULT false;