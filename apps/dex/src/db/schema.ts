import {
  integer,
  numeric,
  pgTable,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

export const referral = pgTable(
  'referral',
  {
    referrer: varchar('referrer').notNull(),
    referral: varchar('referral').notNull(),
  },
  (t) => ({
    un_referrer_referral: unique().on(t.referrer, t.referral),
  }),
);

export const referralUrl = pgTable('referral_url', {
  referrer: varchar('referrer').primaryKey().notNull(),
  url: varchar('url'),
});

export const tokens = pgTable('tokens', {
  chainId: integer('chain_id'),
  address: varchar('address'),
  symbol: varchar('symbol'),
  name: varchar('name'),
  decimals: varchar('decimals'),
});

export const prices = pgTable('prices', {
  symbol: varchar('symbol').primaryKey().notNull(),
  price: numeric('price').notNull(),
  volume: numeric('volume').notNull(),
  marketCap: numeric('marketCap').notNull(),
});

export const price = pgTable('price', {
  chainId: integer('chain_id'),
  token0: varchar('token0'),
  token1: varchar('token1'),
  price: numeric('price').notNull(),
});
