import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StakingModule } from './staking/staking.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot(), StakingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
