CREATE TABLE "issue_work_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid,
	"issue_id" uuid NOT NULL,
	"execution_workspace_id" uuid,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text,
	"title" text NOT NULL,
	"url" text,
	"status" text NOT NULL,
	"review_state" text DEFAULT 'none' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"health_status" text DEFAULT 'unknown' NOT NULL,
	"summary" text,
	"metadata" jsonb,
	"created_by_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "execution_workspaces" ALTER COLUMN "status" SET DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "execution_workspaces" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "project_workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "source_issue_id" uuid;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "mode" text DEFAULT 'issue' NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "strategy_type" text DEFAULT 'branch' NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "base_ref" text;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "branch_name" text;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "provider_type" text DEFAULT 'local_fs' NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "provider_ref" text;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "derived_from_execution_workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "last_used_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "opened_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_work_products" ADD CONSTRAINT "issue_work_products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_work_products" ADD CONSTRAINT "issue_work_products_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_work_products" ADD CONSTRAINT "issue_work_products_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_work_products" ADD CONSTRAINT "issue_work_products_execution_workspace_id_execution_workspaces_id_fk" FOREIGN KEY ("execution_workspace_id") REFERENCES "public"."execution_workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_work_products" ADD CONSTRAINT "issue_work_products_created_by_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("created_by_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_work_products_company_issue_type_idx" ON "issue_work_products" USING btree ("company_id","issue_id","type");--> statement-breakpoint
CREATE INDEX "issue_work_products_company_ew_type_idx" ON "issue_work_products" USING btree ("company_id","execution_workspace_id","type");--> statement-breakpoint
CREATE INDEX "issue_work_products_company_provider_ext_idx" ON "issue_work_products" USING btree ("company_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "issue_work_products_company_updated_idx" ON "issue_work_products" USING btree ("company_id","updated_at");--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD CONSTRAINT "execution_workspaces_project_workspace_id_project_workspaces_id_fk" FOREIGN KEY ("project_workspace_id") REFERENCES "public"."project_workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD CONSTRAINT "execution_workspaces_source_issue_id_issues_id_fk" FOREIGN KEY ("source_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD CONSTRAINT "execution_workspaces_derived_from_execution_workspace_id_execution_workspaces_id_fk" FOREIGN KEY ("derived_from_execution_workspace_id") REFERENCES "public"."execution_workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "execution_workspaces_company_project_status_idx" ON "execution_workspaces" USING btree ("company_id","project_id","status");--> statement-breakpoint
CREATE INDEX "execution_workspaces_company_source_issue_idx" ON "execution_workspaces" USING btree ("company_id","source_issue_id");--> statement-breakpoint
CREATE INDEX "execution_workspaces_company_branch_idx" ON "execution_workspaces" USING btree ("company_id","branch_name");