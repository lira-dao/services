import { Module } from '@nestjs/common';
import { DrizzlePGModule } from '@knaadh/nestjs-drizzle-pg';
import { Web3Module } from './middlewares/web3.module';
import * as schema from './db/schema';
import { ScheduleModule } from '@nestjs/schedule';
import { PricesController } from './scheduler/prices.controller';
import { PricesService } from './scheduler/prices.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    DrizzlePGModule.register({
      tag: 'DB_DEV',
      pg: {
        connection: 'client',
        config: {
          connectionString:
            process.env.POSTGRES_URL,
        },
      },
      config: { schema: { ...schema } },
    }),
    ScheduleModule.forRoot(),
    HttpModule,
    Web3Module,
  ],
  controllers: [PricesController],
  providers: [PricesService],
})
export class AppModule {}
