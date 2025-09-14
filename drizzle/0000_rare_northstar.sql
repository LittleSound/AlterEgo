CREATE TABLE "memory" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "memory_user_id_unique" UNIQUE("user_id")
);
