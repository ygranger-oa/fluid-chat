ALTER TABLE "workspaces" ADD COLUMN "sso_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "sso_show_on_login" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "sso_auto_join_role" "workspace_role" DEFAULT 'member' NOT NULL;--> statement-breakpoint
CREATE TABLE "sso_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'authentik' NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sso_accounts_provider_issuer_subject_unique" UNIQUE("provider","issuer","subject")
);--> statement-breakpoint
CREATE TABLE "sso_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_hash" text NOT NULL,
	"code_verifier" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"redirect_to" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sso_states_state_hash_unique" UNIQUE("state_hash")
);--> statement-breakpoint
ALTER TABLE "sso_accounts" ADD CONSTRAINT "sso_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_states" ADD CONSTRAINT "sso_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
