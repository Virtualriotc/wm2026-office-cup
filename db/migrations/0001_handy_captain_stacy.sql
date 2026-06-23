CREATE TABLE "department_rank_snapshot" (
	"day" date NOT NULL,
	"department_id" text NOT NULL,
	"rank" integer,
	"avg_points" real DEFAULT 0 NOT NULL,
	"active_members" integer DEFAULT 0 NOT NULL,
	"eligible" boolean DEFAULT false NOT NULL,
	CONSTRAINT "department_rank_snapshot_day_department_id_pk" PRIMARY KEY("day","department_id")
);
--> statement-breakpoint
ALTER TABLE "department_rank_snapshot" ADD CONSTRAINT "department_rank_snapshot_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;
