CREATE TABLE "waitlist_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"x_user_id" text NOT NULL,
	"x_handle" text NOT NULL,
	"display_name" text,
	"pfp_url" text,
	"waitlist_number" serial NOT NULL,
	"notification_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_profile_x_user_id_unique" UNIQUE("x_user_id")
);
--> statement-breakpoint
ALTER TABLE "waitlist_profile" ADD CONSTRAINT "waitlist_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "waitlist_profile_x_handle_idx" ON "waitlist_profile" USING btree ("x_handle");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_profile_number_idx" ON "waitlist_profile" USING btree ("waitlist_number");
