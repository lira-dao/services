CREATE TABLE IF NOT EXISTS "prices" (
	"symbol" varchar PRIMARY KEY NOT NULL,
	"price" numeric NOT NULL,
	"volume" numeric NOT NULL,
	"marketCap" numeric NOT NULL
);
