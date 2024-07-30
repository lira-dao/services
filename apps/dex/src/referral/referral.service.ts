import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { EthereumAddress } from '@lira-dao/web3-utils';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import * as process from 'node:process';
import { Web3Provider } from '../services/web3.service';

@Injectable()
export class ReferralService implements OnModuleInit {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private readonly web3: Web3Provider,
    private readonly httpService: HttpService,
    @Inject('DB_DEV') private drizzleDev: NodePgDatabase<typeof schema>,
  ) {}

  onModuleInit() {
    this.listenToEvents();
  }

  async listenToEvents() {}

  async getShortUrl(address: EthereumAddress): Promise<string> {
    this.logger.log('request url for ' + address);

    const result = await this.drizzleDev
      .select()
      .from(schema.referralUrl)
      .where(eq(schema.referralUrl.referrer, address));

    console.log('result', result);

    if (result.length === 0) {
      this.logger.log('create new url');

      const { data: newUrl } = await firstValueFrom(
        this.httpService.post<{ code: string; shrtlnk: string }>(
          'https://shrtlnk.dev/api/v2/link',
          {
            url: `${process.env.DEX_URL}/referral/${address}`,
          },
          {
            headers: {
              'api-key': process.env.SHRTLNK_API_KEY,
            },
          },
        ),
      );

      // const newUrl = await axios.post(
      //   'https://shrtlnk.dev/api/v2/link',
      //   {
      //     url: 'referral/' + address,
      //   },
      //   {
      //     headers: {
      //       'api-key': 'C4pxzZp4eYuC86upH3ef91U6sNBbXUkgWnIUstGWBOt5I',
      //     },
      //   },
      // );

      this.logger.log('new url ' + newUrl.shrtlnk);

      await this.drizzleDev
        .insert(schema.referralUrl)
        .values({ referrer: address, url: newUrl.shrtlnk });

      return newUrl.shrtlnk;
    }

    this.logger.log('cached url ' + result[0].url);

    return result[0].url;
  }
}
