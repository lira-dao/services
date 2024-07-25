import { Module } from '@nestjs/common';
import { Web3SocketService } from '../services/web3.service';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';

@Module({
  providers: [Web3SocketService, ReferralService],
  controllers: [ReferralController],
})
export class ReferralModule {}
