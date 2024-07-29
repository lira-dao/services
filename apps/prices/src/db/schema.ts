import { pgTable, numeric, varchar } from 'drizzle-orm/pg-core';

export const prices = pgTable('prices', {
  symbol: varchar('symbol').primaryKey().notNull(),
  price: numeric('price').notNull(),
  volume: numeric('volume').notNull(),
  marketCap: numeric('marketCap').notNull(),
});
