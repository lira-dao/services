import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Web3SocketService } from '../services/web3.service';
import { tokenStakerAddresses } from '@lira-dao/web3-utils';
import * as TokenStaker from '@lira-dao/web3-utils/dist/abi/json/TokenStaker.json';

@Injectable()
export class StakingService implements OnModuleInit {
  private readonly logger = new Logger(StakingService.name);

  constructor(private readonly web3Service: Web3SocketService) {}

  onModuleInit() {
    this.listenToEvents();
  }

  async listenToEvents() {
    const web3 = this.web3Service.getWeb3Instance();

    const chainId = await web3.eth.getChainId();
    const tokenStakerAddress = tokenStakerAddresses[chainId.toString()].tbb;

    this.logger.debug('tokenStakerAddress: ' + tokenStakerAddress);

    const contract = new web3.eth.Contract(TokenStaker.abi, tokenStakerAddress);

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
