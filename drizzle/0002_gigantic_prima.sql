CREATE TABLE `agenda_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`title` text NOT NULL,
	`category` text DEFAULT 'famille' NOT NULL,
	`duration_minutes` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agenda_events_date_idx` ON `agenda_events` (`date`);--> statement-breakpoint
CREATE INDEX `agenda_events_date_time_idx` ON `agenda_events` (`date`,`time`);