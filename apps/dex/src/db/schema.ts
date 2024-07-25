import { pgTable, varchar } from 'drizzle-orm/pg-core';

export const referral = pgTable('referral', {
  referrer: varchar('referrer'),
  referral: varchar('referral'),
});

export const referralCode = pgTable('referrals-short-links', {
  referrer: varchar('referrer').primaryKey().notNull(),
  code: varchar('code'),
});
