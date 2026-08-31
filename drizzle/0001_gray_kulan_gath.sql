CREATE TABLE `meal_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`moment` text NOT NULL,
	`label` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_plans_date_moment_unique` ON `meal_plans` (`date`,`moment`);--> statement-breakpoint
CREATE INDEX `meal_plans_date_idx` ON `meal_plans` (`date`);