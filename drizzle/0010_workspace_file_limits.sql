ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "max_upload_mb" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "storage_limit_mb" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "file_retention_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "expires_at" DROP NOT NULL;
