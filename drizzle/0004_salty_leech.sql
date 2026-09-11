CREATE TABLE `list_mutations` (
	`id` text PRIMARY KEY NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
