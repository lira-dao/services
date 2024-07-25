import { Module } from '@nestjs/common';
import { Web3SocketService } from '../services/web3.service';
import { StakingService } from './staking.service';

@Module({
  providers: [Web3SocketService, StakingService],
})
export class StakingModule {}
