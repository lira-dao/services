import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { tokenStakerAddresses } from '@lira-dao/web3-utils';
import * as TokenStaker from '@lira-dao/web3-utils/dist/abi/json/TokenStaker.json';
import { Web3Provider } from '../services/web3.service';

@Injectable()
export class StakingService implements OnModuleInit {
  private readonly logger = new Logger(StakingService.name);

  constructor(private readonly web3: Web3Provider) {}

  async onModuleInit() {
    // await this.listenToEvents();
  }

  async listenToEvents() {
    const chainId = await this.web3.getChainId();
    const tokenStakerAddress = tokenStakerAddresses[chainId.toString()].tbb;

    const contract = new this.web3.rpc.eth.Contract(
      TokenStaker.abi,
      tokenStakerAddress,
    );

    contract.events.Stake().on('data', (event) => {
      console.log(
        'stake',
        event.returnValues.wallet,
        event.returnValues.amount,
      );
    });

    contract.events.Unstake().on('data', (event) => {
      console.log(
        'unstake',
        event.returnValues.wallet,
        event.returnValues.amount,
      );
    });
  }
}
