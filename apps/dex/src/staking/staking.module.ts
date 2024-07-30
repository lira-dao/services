import { Module } from '@nestjs/common';
import { Web3Provider } from '../services/web3.service';
import { StakingService } from './staking.service';

@Module({
  providers: [Web3Provider, StakingService],
})
export class StakingModule {}
