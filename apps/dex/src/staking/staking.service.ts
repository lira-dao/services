import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { tokenStakerAddresses } from '@lira-dao/web3-utils';
import { Web3Provider } from '../services/web3.service';
import * as TokenStaker from '@lira-dao/web3-utils/dist/abi/json/TokenStaker.json';

@Injectable()
export class StakingService implements OnModuleInit {
  private readonly logger = new Logger(StakingService.name);

  constructor(
    private readonly web3: Web3Provider,
    @Inject('DB_DEV') private drizzleDev: NodePgDatabase<typeof schema>,
  ) {}

  async onModuleInit() {
    await this.listenToAllStakingEvents();
  }

  async listenToAllStakingEvents() {
    const chainId = await this.web3.getChainId();
    const stakingContracts = tokenStakerAddresses[chainId.toString()];

    await Promise.all(
      Object.keys(stakingContracts).map(async (key) => {
        const tokenStakerAddress = stakingContracts[key];
        this.logger.log(
          `[listenToAllStakingEvents] Subscribing to staking/unstaking events for ${key} at address ${tokenStakerAddress}`,
        );
        await this.listenToStakingEvents(tokenStakerAddress, key);
      })
    );
  }

  async listenToStakingEvents(tokenStakerAddress: string, contractName: string) {

    const contract = new this.web3.socket.eth.Contract(
      TokenStaker.abi,
      tokenStakerAddress,
    );

    contract.events.Stake().on('data', async (event) => {

      const address = event.returnValues.wallet as string;
      const amount = BigInt(event.returnValues.amount as string);
      const txId = event.transactionHash;

      this.logger.log(`[${contractName}] Stake event: wallet=${address}, amount=${amount}, txId=${txId}`);

      const alreadyStaked = await this.hasStaked(address);
      if (!alreadyStaked) {
        const referrer = await this.getReferrer(address);
        if (referrer) {
          const rewardAmount = (amount * 10n) / 100n;  // Calculate reward (10% of staking)

          const insertResult = await this.drizzleDev
            .insert(schema.stakingRewards)
            .values({
              stakerAddress: address,
              referrerAddress: referrer,
              stakedAmount: amount.toString(),
              rewardAmount: rewardAmount.toString(),
              stakingTxId: txId,
              rewardTxId: null,
            })
            .returning();

          if (insertResult.length > 0) {
            this.logger.log(`[${contractName}] Staking record created: stakerAddress=${address}, referrerAddress=${referrer}, amount=${amount}, rewardAmount=${rewardAmount}, txId=${txId}`);
          } else {
            this.logger.error(`[${contractName}] Error inserting staking record for wallet=${address}`);
          }
        }
      }
    });

    contract.events.Unstake().on('data', async (event) => {
      const wallet = event.returnValues.wallet as string;
      const amount = event.returnValues.amount;
      const txId = event.transactionHash;

      this.logger.log(`[${contractName}] Unstake event: wallet=${wallet}, amount=${amount}, txId=${txId}`);
    });

    contract.events.Stake().on('error', (error) => {
      this.logger.error(`[${contractName}] Error catching Stake event: ${error}`, error);
    });

    contract.events.Unstake().on('error', (error) => {
      this.logger.error(`[${contractName}] Error catching Unstake event: ${error}`, error);
    });
  }

  async hasStaked(walletAddress: string): Promise<boolean> {
    const result = await this.drizzleDev
      .select()
      .from(schema.stakingRewards)
      .where(eq(schema.stakingRewards.stakerAddress, walletAddress))
      .limit(1);

    return result.length > 0;
  }

  async getReferrer(address: string): Promise<string | null> {
    const result = await this.drizzleDev
      .select()
      .from(schema.referral)
      .where(eq(schema.referral.referral, address));
  
    return result.length > 0 ? result[0].referrer : null;
  }
}
