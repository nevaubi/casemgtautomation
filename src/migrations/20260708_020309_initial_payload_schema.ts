import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE SCHEMA IF NOT EXISTS "payload";
   CREATE TYPE "payload"."enum_matters_status" AS ENUM('Intake', 'Records Review', 'Demand Prep', 'Filed');
  CREATE TYPE "payload"."enum_case_documents_status" AS ENUM('Auto-Processed', 'Needs Review', 'Reviewed', 'Written Back');
  CREATE TYPE "payload"."enum_findings_routing" AS ENUM('auto', 'review', 'escalated', 'negated');
  CREATE TYPE "payload"."enum_findings_source" AS ENUM('text_layer', 'ocr');
  CREATE TYPE "payload"."enum_findings_decision" AS ENUM('approved', 'rejected', 'corrected', 'escalated');
  CREATE TYPE "payload"."enum_users_role" AS ENUM('reviewer', 'supervisor', 'admin');
  CREATE TABLE "payload"."matters" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"caption" varchar,
  	"matter_number" varchar,
  	"sf_id" varchar,
  	"team" varchar,
  	"attorney" varchar,
  	"status" "payload"."enum_matters_status" DEFAULT 'Records Review',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."case_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"matter_id" integer,
  	"doc_type" varchar,
  	"facility" varchar,
  	"received" timestamp(3) with time zone,
  	"pages" numeric,
  	"ocr_pages" numeric,
  	"mean_ocr_conf" numeric,
  	"processing_seconds" numeric,
  	"status" "payload"."enum_case_documents_status",
  	"enriched_pdf_url" varchar,
  	"slug_id" varchar,
  	"sf_content_document_id" varchar,
  	"sf_content_version_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."findings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"document_id" integer NOT NULL,
  	"idx" numeric NOT NULL,
  	"term_label" varchar NOT NULL,
  	"category_label" varchar,
  	"variant" varchar,
  	"page" numeric,
  	"confidence" numeric,
  	"match_quality" numeric,
  	"ocr_conf" numeric,
  	"routing" "payload"."enum_findings_routing",
  	"source" "payload"."enum_findings_source",
  	"negated" boolean,
  	"evidence" varchar,
  	"decision" "payload"."enum_findings_decision",
  	"decided_by" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."audit_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"event" varchar NOT NULL,
  	"detail" varchar,
  	"actor" varchar,
  	"document_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "payload"."users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"role" "payload"."enum_users_role" DEFAULT 'reviewer',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload"."payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"matters_id" integer,
  	"case_documents_id" integer,
  	"findings_id" integer,
  	"audit_events_id" integer,
  	"users_id" integer
  );
  
  CREATE TABLE "payload"."payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload"."payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."case_documents" ADD CONSTRAINT "case_documents_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "payload"."matters"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."findings" ADD CONSTRAINT "findings_document_id_case_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "payload"."case_documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_matters_fk" FOREIGN KEY ("matters_id") REFERENCES "payload"."matters"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_case_documents_fk" FOREIGN KEY ("case_documents_id") REFERENCES "payload"."case_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_findings_fk" FOREIGN KEY ("findings_id") REFERENCES "payload"."findings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_events_fk" FOREIGN KEY ("audit_events_id") REFERENCES "payload"."audit_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "matters_updated_at_idx" ON "payload"."matters" USING btree ("updated_at");
  CREATE INDEX "matters_created_at_idx" ON "payload"."matters" USING btree ("created_at");
  CREATE INDEX "case_documents_matter_idx" ON "payload"."case_documents" USING btree ("matter_id");
  CREATE INDEX "case_documents_updated_at_idx" ON "payload"."case_documents" USING btree ("updated_at");
  CREATE INDEX "case_documents_created_at_idx" ON "payload"."case_documents" USING btree ("created_at");
  CREATE INDEX "findings_document_idx" ON "payload"."findings" USING btree ("document_id");
  CREATE INDEX "findings_updated_at_idx" ON "payload"."findings" USING btree ("updated_at");
  CREATE INDEX "findings_created_at_idx" ON "payload"."findings" USING btree ("created_at");
  CREATE INDEX "audit_events_updated_at_idx" ON "payload"."audit_events" USING btree ("updated_at");
  CREATE INDEX "audit_events_created_at_idx" ON "payload"."audit_events" USING btree ("created_at");
  CREATE INDEX "users_sessions_order_idx" ON "payload"."users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "payload"."users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "payload"."users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "payload"."users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "payload"."users" USING btree ("email");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload"."payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload"."payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload"."payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload"."payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload"."payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload"."payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload"."payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_matters_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("matters_id");
  CREATE INDEX "payload_locked_documents_rels_case_documents_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("case_documents_id");
  CREATE INDEX "payload_locked_documents_rels_findings_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("findings_id");
  CREATE INDEX "payload_locked_documents_rels_audit_events_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("audit_events_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload"."payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload"."payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload"."payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload"."payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload"."payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload"."payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload"."payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload"."payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload"."payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."matters" CASCADE;
  DROP TABLE "payload"."case_documents" CASCADE;
  DROP TABLE "payload"."findings" CASCADE;
  DROP TABLE "payload"."audit_events" CASCADE;
  DROP TABLE "payload"."users_sessions" CASCADE;
  DROP TABLE "payload"."users" CASCADE;
  DROP TABLE "payload"."payload_kv" CASCADE;
  DROP TABLE "payload"."payload_locked_documents" CASCADE;
  DROP TABLE "payload"."payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload"."payload_preferences" CASCADE;
  DROP TABLE "payload"."payload_preferences_rels" CASCADE;
  DROP TABLE "payload"."payload_migrations" CASCADE;
  DROP TYPE "payload"."enum_matters_status";
  DROP TYPE "payload"."enum_case_documents_status";
  DROP TYPE "payload"."enum_findings_routing";
  DROP TYPE "payload"."enum_findings_source";
  DROP TYPE "payload"."enum_findings_decision";
  DROP TYPE "payload"."enum_users_role";`)
}
