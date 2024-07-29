import { numeric, pgTable, varchar } from 'drizzle-orm/pg-core';

export const referral = pgTable('referral', {
  referrer: varchar('referrer'),
  referral: varchar('referral'),
});

export const referralUrl = pgTable('referral_url', {
  referrer: varchar('referrer').primaryKey().notNull(),
  url: varchar('url'),
});

export const prices = pgTable('prices', {
  symbol: varchar('symbol').primaryKey().notNull(),
  price: numeric('price').notNull(),
  volume: numeric('volume').notNull(),
  marketCap: numeric('marketCap').notNull(),
});
