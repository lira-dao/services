import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Web3SocketService } from '../services/web3.service';
import { NodePgDatabase } from 'drizzle-orm/node-postgres/index';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { EthereumAddress } from '@lira-dao/web3-utils';
import axios from 'axios';

@Injectable()
export class ReferralService implements OnModuleInit {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private readonly web3Service: Web3SocketService,
    @Inject('DB_DEV') private drizzleDev: NodePgDatabase<typeof schema>,
  ) {
  }

  onModuleInit() {
    this.listenToEvents();
  }

  async listenToEvents() {
    const web3 = this.web3Service.getWeb3Instance();

    const chainId = await web3.eth.getChainId();
  }

  async getShortUrl(address: EthereumAddress): Promise<string> {
    this.logger.log('request url for ' + address);

    const result = await this.drizzleDev
      .select()
      .from(schema.referralCode)
      .where(eq(schema.referralCode.referrer, address));

    console.log('result', result);

    if (result.length === 0) {
      this.logger.log('create new url');

      const newUrl = await axios.post(
        'https://shrtlnk.dev/api/v2/link',
        {
          url: 'referral/' + address,
        },
        {
          headers: {
            'api-key': 'C4pxzZp4eYuC86upH3ef91U6sNBbXUkgWnIUstGWBOt5I',
          },
        },
      );

      this.logger.log('new url ' + newUrl.data.shrtlnk);

      await this.drizzleDev
        .insert(schema.referralCode)
        .values({ referrer: address, code: newUrl.data.shrtlnk });

      return newUrl.data.shrtlnk;
    }

    this.logger.log('cached url ' + result[0].code);

    return result[0].code;
  }
}
