import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StakingModule } from './staking/staking.module';
import { ConfigModule } from '@nestjs/config';
import { ReferralModule } from './referral/referral.module';
import { DrizzlePGModule } from '@knaadh/nestjs-drizzle-pg';
import * as schema from './db/schema';

@Module({
  imports: [
    ConfigModule.forRoot(),
    DrizzlePGModule.register({
      tag: 'DB_DEV',
      pg: {
        connection: 'client',
        config: {
          connectionString: process.env.POSTGRES_URL,
        },
      },
      config: { schema: { ...schema } },
    }),
    StakingModule,
    ReferralModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
