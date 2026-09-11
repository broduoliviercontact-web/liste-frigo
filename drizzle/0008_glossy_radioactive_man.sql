CREATE TABLE `access_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `access_sessions_expiry_idx` ON `access_sessions` (`expires_at`);