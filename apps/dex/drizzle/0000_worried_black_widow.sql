CREATE TABLE IF NOT EXISTS "referral" (
	"referrer" varchar,
	"referral" varchar
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referrals-short-links" (
	"referrer" varchar PRIMARY KEY NOT NULL,
	"code" varchar
);
