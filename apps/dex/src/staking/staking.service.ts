import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import { tokenStakerAddresses, tokens, erc20Abi } from '@lira-dao/web3-utils';
import { Web3Provider } from '../services/web3.service';
import * as TokenStaker from '@lira-dao/web3-utils/dist/abi/json/TokenStaker.json';
import * as MulticallAbi from '../../abi/json/Multicall.json';

@Injectable()
export class StakingService implements OnModuleInit {
  private readonly logger = new Logger(StakingService.name);

  constructor(
    private readonly web3: Web3Provider,
    @Inject('DB_DEV') private drizzleDev: NodePgDatabase<typeof schema>,
  ) {}

  async onModuleInit() {
    await this.listenToAllStakingEvents();
    // await this.distributePendingRewards();
  }

  // TODO: Listen time lock staking pool
  async listenToAllStakingEvents() {
    const chainId = await this.web3.getChainId();
    const stakingContracts = tokenStakerAddresses[chainId.toString()];
    const tokenContracts = tokens[chainId.toString()];

    await Promise.all(
      Object.keys(stakingContracts).map(async (key) => {
        const tokenStakerAddress = stakingContracts[key];
        const tokenAddress = tokenContracts[key];

        this.logger.log(
          `[listenToAllStakingEvents] Subscribing to staking/unstaking events for ${key} at address ${tokenStakerAddress} forn token ${tokenAddress}`,
        );
        await this.listenToStakingEvents(tokenStakerAddress, tokenAddress, key);
      })
    );
  }

  async listenToStakingEvents(tokenStakerAddress: string, tokenAddress: string, contractName: string) {

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
              tokenAddress: tokenAddress,
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
      const address = event.returnValues.wallet as string;
      const amount = event.returnValues.amount;
      const txId = event.transactionHash;

      this.logger.log(`[${contractName}] Unstake event: stakerAddress=${address}, amount=${amount}, txId=${txId}`);
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

  @Cron('0 2 * * *')
  async distributePendingRewards() {
    try {
      this.logger.debug('Checking for pending rewards to distribute.');

      const unrewardedStakes = await this.drizzleDev
        .select()
        .from(schema.stakingRewards)
        .where(isNull(schema.stakingRewards.rewardTxId));

      if (unrewardedStakes.length > 0) {
        this.logger.log(`Found ${unrewardedStakes.length} unrewarded stakes. Processing multicall.`);

        const web3 = this.web3.getWeb3Instance();
        const chainId = await this.web3.getChainId();

        // TODO: Improve with lira-dao/utils
        const multicallAddress = chainId === 421614n 
          ? '0xA115146782b7143fAdB3065D86eACB54c169d092' 
          : '0x842eC2c7D803033Edf55E478F461FC547Bc54EB2';
        
        const multicallContract = new web3.eth.Contract(MulticallAbi, multicallAddress);

        // Step 1: Calculate total reward amount needed per token
        const tokenRewardAmounts: Record<string, bigint> = {};
        unrewardedStakes.forEach(stake => {
          if (!tokenRewardAmounts[stake.tokenAddress]) {
            tokenRewardAmounts[stake.tokenAddress] = BigInt(0);
          }
          tokenRewardAmounts[stake.tokenAddress] += BigInt(stake.rewardAmount) * 2n; // For staker and referrer
        });

        // Step 2: Ensure allowances are sufficient
        for (const [tokenAddress, totalRewardAmount] of Object.entries(tokenRewardAmounts)) {
          const tbTokenContract = new web3.eth.Contract(erc20Abi, tokenAddress);
          const allowance = await tbTokenContract.methods
            .allowance(process.env.WALLET_ADDRESS, multicallAddress)
            .call();

          if (BigInt(allowance) < totalRewardAmount) {
            const approveTxData = tbTokenContract.methods
              .approve(multicallAddress, totalRewardAmount.toString())
              .encodeABI();

            const approveGasEstimate = await web3.eth.estimateGas({
              from: process.env.WALLET_ADDRESS,
              to: tokenAddress,
              data: approveTxData,
            });

            const block = await web3.eth.getBlock('latest');

            const tx = {
              from: process.env.WALLET_ADDRESS,
              to: tokenAddress,
              data: approveTxData,
              gas: approveGasEstimate.toString(),
              maxFeePerGas: block.baseFeePerGas * 2n,
              maxPriorityFeePerGas: 100000,
            };

            const signedTx = await web3.eth.accounts.signTransaction(tx, process.env.WALLET_PRIVATE_KEY);
            await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
            this.logger.log(`Approved ${tokenAddress} successfully`);
          }
        }

        // Step 3: Prepare and send multicall for transfers
        const calls = unrewardedStakes.flatMap(stake => {
          const tbTokenContract = new web3.eth.Contract(erc20Abi, stake.tokenAddress);
          return [
            {
              target: stake.tokenAddress,
              callData: tbTokenContract.methods.transferFrom(
                process.env.WALLET_ADDRESS, 
                stake.stakerAddress, 
                stake.rewardAmount.toString()
              ).encodeABI(),
            },
            {
              target: stake.tokenAddress,
              callData: tbTokenContract.methods.transferFrom(
                process.env.WALLET_ADDRESS, 
                stake.referrerAddress, 
                stake.rewardAmount.toString()
              ).encodeABI(),
            }
          ];
        });

        const tx = multicallContract.methods.tryAggregate(false, calls);
        const gasEstimate = await tx.estimateGas({
          from: process.env.WALLET_ADDRESS
        });

        const block = await web3.eth.getBlock('latest');

        const signedTx = await web3.eth.accounts.signTransaction({
          from: process.env.WALLET_ADDRESS,
          to: multicallAddress,
          data: tx.encodeABI(),
          gas: gasEstimate.toString(),
          maxFeePerGas: block.baseFeePerGas * 2n,
          maxPriorityFeePerGas: 100000,
        }, process.env.WALLET_PRIVATE_KEY);

        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        this.logger.log(`Transaction to staker sent. Hash: ${receipt.transactionHash}`);

        await this.updateRewardTxId(unrewardedStakes, receipt.transactionHash);
      } else {
        this.logger.log('No unrewarded stakes found.');
      }
    } catch (error) {
      this.logger.error('Error in distributePendingRewards', error);
    }
  }
  
  private async updateRewardTxId(stakes, hash) {
    await Promise.all(stakes.map(stake => {
      return this.drizzleDev.update(schema.stakingRewards)
        .set({ rewardTxId: hash })
        .where(eq(schema.stakingRewards.stakerAddress, stake.stakerAddress));
    }));
  }
}
