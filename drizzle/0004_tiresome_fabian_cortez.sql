CREATE TABLE `financial_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`provider` enum('shopify','paypal','ebay','stripe','bank','credit_card','amazon','etsy','dsers','cj_dropshipping','facebook_ads','google_ads','tiktok_ads','other') NOT NULL,
	`accountType` enum('revenue','expense','bank','credit_card','marketplace','ad_platform','payment_processor') NOT NULL,
	`currency` varchar(8) NOT NULL DEFAULT 'USD',
	`currentBalance` float DEFAULT 0,
	`credentials` json,
	`isConnected` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`lastSyncedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financial_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tax_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taxYear` int NOT NULL,
	`businessName` varchar(255),
	`ein` varchar(20),
	`ssn` varchar(20),
	`filingStatus` enum('sole_proprietor','llc_single','llc_partnership','s_corp','c_corp') NOT NULL DEFAULT 'sole_proprietor',
	`stateCode` varchar(4),
	`selfEmploymentTaxRate` float DEFAULT 15.3,
	`incomeTaxBracketRate` float DEFAULT 22,
	`stateTaxRate` float DEFAULT 0,
	`quarterlyDueDates` json,
	`homeOfficeDeduction` boolean DEFAULT false,
	`homeOfficePercent` float DEFAULT 0,
	`vehicleDeduction` boolean DEFAULT false,
	`vehicleMiles` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tax_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`date` timestamp NOT NULL,
	`description` varchar(512) NOT NULL,
	`amount` float NOT NULL,
	`type` enum('income','expense','refund','fee','transfer','adjustment') NOT NULL,
	`category` enum('product_sales','shipping_collected','other_income','product_cost','shipping_cost','supplier_fees','platform_fees','payment_processing','advertising','software_subscriptions','office_supplies','professional_services','bank_charges','returns_refunds','packaging','storage_fulfillment','taxes_licenses','insurance','education_training','travel','utilities','other_expense') NOT NULL,
	`subcategory` varchar(128),
	`source` enum('shopify','paypal','ebay','stripe','bank','credit_card','facebook_ads','google_ads','tiktok_ads','dsers','cj_dropshipping','manual','other') NOT NULL DEFAULT 'manual',
	`taxDeductible` boolean NOT NULL DEFAULT false,
	`taxCategory` varchar(128),
	`ebayFeeType` enum('final_value_fee','insertion_fee','promoted_listing_fee','shipping_label_fee','international_fee','dispute_fee','store_subscription','other_ebay_fee'),
	`externalId` varchar(255),
	`orderId` varchar(255),
	`notes` text,
	`isReconciled` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
