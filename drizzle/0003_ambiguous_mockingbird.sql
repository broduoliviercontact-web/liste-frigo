CREATE TABLE IF NOT EXISTS `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `transit_snapshots` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`updated_at` text NOT NULL,
	`checked_at` integer NOT NULL,
	`payload` text NOT NULL
);
