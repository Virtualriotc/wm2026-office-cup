CREATE TYPE "public"."match_status" AS ENUM('scheduled', 'locked', 'final');--> statement-breakpoint
CREATE TYPE "public"."outcome" AS ENUM('home', 'draw', 'away');--> statement-breakpoint
CREATE TYPE "public"."result_source" AS ENUM('organizer', 'feed');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('group', 'r32', 'r16', 'qf', 'sf', 'final');--> statement-breakpoint
CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"color" text NOT NULL,
	CONSTRAINT "departments_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "leaderboard_department" (
	"department_id" text PRIMARY KEY NOT NULL,
	"avg_points" real DEFAULT 0 NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"rank" integer NOT NULL,
	"climb_delta" integer DEFAULT 0 NOT NULL,
	"eligible" boolean DEFAULT true NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaderboard_user" (
	"user_id" text PRIMARY KEY NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"rank" integer NOT NULL,
	"percentile" integer NOT NULL,
	"climb_delta" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"stage" "stage" NOT NULL,
	"group" text,
	"home" text NOT NULL,
	"away" text NOT NULL,
	"kickoff" timestamp with time zone NOT NULL,
	"status" "match_status" DEFAULT 'scheduled' NOT NULL,
	"external_ref" text
);
--> statement-breakpoint
CREATE TABLE "office_consensus" (
	"match_id" text NOT NULL,
	"pct_home" integer DEFAULT 0 NOT NULL,
	"pct_draw" integer DEFAULT 0 NOT NULL,
	"pct_away" integer DEFAULT 0 NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "office_consensus_match_id_pk" PRIMARY KEY("match_id")
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"match_id" text NOT NULL,
	"pick" "outcome" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "results" (
	"match_id" text PRIMARY KEY NOT NULL,
	"outcome" "outcome" NOT NULL,
	"source" "result_source" DEFAULT 'feed' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_note" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"department_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"is_organizer" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leaderboard_department" ADD CONSTRAINT "leaderboard_department_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_user" ADD CONSTRAINT "leaderboard_user_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_consensus" ADD CONSTRAINT "office_consensus_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "predictions_user_match_unq" ON "predictions" USING btree ("user_id","match_id");--> statement-breakpoint
CREATE INDEX "predictions_match_idx" ON "predictions" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_token_hash_idx" ON "users" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "users_department_idx" ON "users" USING btree ("department_id");