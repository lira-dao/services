import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { catchError, firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { HttpService } from '@nestjs/axios';
import * as schema from '../db/schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface CoinMarketCapPricesResponse {
  data: {
    [key: string]: {
      quote: {
        USD: {
          price: number;
          volume_24h: number;
          market_cap: number;
        };
      };
    };
  };
}

@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);

  constructor(
    private readonly httpService: HttpService,
    @Inject('DB_DEV') private drizzleDev: NodePgDatabase<typeof schema>,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    this.logger.debug('start updating prices');

    const prices = await this.getPrices();

    // handle btc price
    if (prices.data && prices.data['1'].quote) {
      const priceBtc = prices.data['1'].quote.USD;

      const values = {
        symbol: 'BTC',
        price: priceBtc.price.toString(),
        volume: priceBtc.volume_24h.toString(),
        marketCap: priceBtc.market_cap.toString(),
      };

      this.drizzleDev
        .insert(schema.prices)
        .values(values)
        .onConflictDoUpdate({
          target: schema.prices.symbol,
          set: values,
        })
        .then(() => this.logger.debug('updated btc price'))
        .catch((err) => this.logger.error('error updating btc price', err));
    }

    // handle eth price
    if (prices.data && prices.data['1027']) {
      const priceEth = prices.data['1027'].quote.USD;

      const values = {
        symbol: 'ETH',
        price: priceEth.price.toString(),
        volume: priceEth.volume_24h.toString(),
        marketCap: priceEth.market_cap.toString(),
      };

      this.drizzleDev
        .insert(schema.prices)
        .values(values)
        .onConflictDoUpdate({
          target: schema.prices.symbol,
          set: values,
        })
        .then(() => this.logger.debug('updated eth price'))
        .catch((err) => this.logger.error('error updating eth price', err));
    }
  }

  async getPrices(): Promise<CoinMarketCapPricesResponse> {
    const { data } = await firstValueFrom(
      this.httpService
        .get<CoinMarketCapPricesResponse>(
          'https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?id=1,1027',
          {
            headers: {
              'X-CMC_PRO_API_KEY': process.env.CMC_API_KEY,
            },
          },
        )
        .pipe(
          catchError((error: AxiosError) => {
            this.logger.error(error.response.data);
            throw 'An error happened!';
          }),
        ),
    );

    return data;
  }

  async getAllPrices() {
    this.logger.debug('Fetching all prices from db.');

    try {
      const results = await this.drizzleDev
        .select()
        .from(schema.prices)
        .execute();
      return results;
    } catch (error) {
      this.logger.error('Error fetching all prices', error);
      throw new InternalServerErrorException('Error fetching all prices');
    }
  }
}
