import { sql } from 'drizzle-orm';
import {
  integer,
  numeric,
  pgTable,
  serial,
  unique,
  varchar,
  timestamp
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

export const stakingRewards = pgTable('staking_rewards', {
  id: serial('id').primaryKey(),
  stakerAddress: varchar('staker_address').notNull(),
  referrerAddress: varchar('referrer_address'),
  tokenAddress: varchar('staked_token_address').notNull(),
  stakedAmount: numeric('staked_amount').notNull(),
  rewardAmount: numeric('reward_amount').notNull(),
  stakingTxId: varchar('staking_tx_id').notNull(),
  rewardTxId: varchar('reward_tx_id'),
  createdAt: timestamp('created_at').default(sql`now()`),
});