CREATE TABLE "waitlist_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"member_id" text NOT NULL,
	"session_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_session_id_class_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_member_session_idx" ON "waitlist_entry" USING btree ("session_id","member_id");--> statement-breakpoint
CREATE INDEX "waitlist_session_joined_at_idx" ON "waitlist_entry" USING btree ("session_id","joined_at");
