import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { catchError, firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { HttpService } from '@nestjs/axios';
import * as schema from '../db/schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Web3Provider } from '../services/web3.service';
import * as UniswapV2Pair from '@lira-dao/web3-utils/dist/abi/json/UniswapV2Pair.json';
import * as UniswapV2Router02 from '@lira-dao/web3-utils/dist/abi/json/UniswapV2Router02.json';
import { dexAddress, dexPairs, tokens } from '@lira-dao/web3-utils';
import { eq } from 'drizzle-orm';
import BigNumber from 'bignumber.js';

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
export class PricesService implements OnModuleInit {
  private readonly logger = new Logger(PricesService.name);

  constructor(
    private readonly web3: Web3Provider,
    private readonly httpService: HttpService,
    @Inject('DB_DEV') private drizzleDev: NodePgDatabase<typeof schema>,
  ) {}

  async onModuleInit() {
    await this.listenToLdtPairEvents();
    await this.listenToLiraPairEvents();
    await this.listenToTbbPairEvents();
    await this.listenToTbsPairEvents();
    await this.listenToTbgPairEvents();
  }

  async listenToLdtPairEvents() {
    const chainId = await this.web3.getChainId();

    const ldtPairAddress = Object.keys(dexPairs[chainId.toString()])[0];

    const contract = new this.web3.socket.eth.Contract(
      UniswapV2Pair.abi,
      ldtPairAddress,
    );

    const router = new this.web3.rpc.eth.Contract(
      UniswapV2Router02.abi,
      dexAddress[chainId.toString()].router,
    );

    contract.events.Swap().on('data', async (data) => {
      this.logger.log('[LdtSwap] data', data, ldtPairAddress);

      const pair = new this.web3.rpc.eth.Contract(
        UniswapV2Pair.abi,
        ldtPairAddress,
      );

      // TODO: remove when token table is present
      const token0 = await pair.methods.token0().call();
      const token1 = await pair.methods.token1().call();

      this.logger.log('[tokens]', {
        token0: token0,
        token1: token1,
      });

      // TODO: decimals
      const amountsOut = await router.methods
        .getAmountsOut(10n ** 18n, [token0, token1])
        .call();

      const ethPrice = await this.drizzleDev
        .select()
        .from(schema.prices)
        .where(eq(schema.prices.symbol, 'ETH'));

      this.logger.log('[ethPrice] ' + ethPrice[0].price);
      this.logger.log('[amountsOut] ' + amountsOut[1]);

      this.logger.log('[price] a', new BigNumber(amountsOut[1]).div(10 ** 18));
      this.logger.log(
        '[price] b',
        new BigNumber(amountsOut[1]).div(10 ** 18).times(ethPrice[0].price),
      );

      const ldtValues = {
        symbol: 'LDT',
        price: new BigNumber(amountsOut[1])
          .div(10 ** 18)
          .times(ethPrice[0].price)
          .toString(),
        volume: '0',
        marketCap: '0',
      };

      this.drizzleDev
        .insert(schema.prices)
        .values(ldtValues)
        .onConflictDoUpdate({
          target: schema.prices.symbol,
          set: ldtValues,
        })
        .then(() => this.logger.debug('updated btc price'))
        .catch((err) => this.logger.error('error updating btc price', err));
    });

    contract.events.Swap().on('error', (error) => {
      this.logger.log('[LdtSwap] error', error);
    });

    contract.events.Swap().on('changed', (changed) => {
      this.logger.log('[LdtSwap] changed', changed);
    });

    contract.events.Swap().on('connected', (connected) => {
      this.logger.log('[LdtSwap] connected: ' + connected);
    });
  }

  async listenToLiraPairEvents() {
    const chainId = await this.web3.getChainId();

    const liraAddress = Object.keys(dexPairs[chainId.toString()])[1];

    const liraPair = new this.web3.socket.eth.Contract(
      UniswapV2Pair.abi,
      liraAddress,
    );

    const router = new this.web3.rpc.eth.Contract(
      UniswapV2Router02.abi,
      dexAddress[chainId.toString()].router,
    );

    liraPair.events.Swap().on('data', async (data) => {
      this.logger.log('[LiraSwap] data', data);
      const pair = new this.web3.rpc.eth.Contract(
        UniswapV2Pair.abi,
        liraAddress,
      );

      // TODO: remove when token table is present
      const token0 = await pair.methods.token0().call();
      const token1 = await pair.methods.token1().call();

      const pairTokens =
        token0 !== tokens[chainId.toString()].ldt
          ? [token0, token1]
          : [token1, token0];

      this.logger.log('[LiraSwap pair]', pair);
      this.logger.log('[LiraSwap pairTokens]', pairTokens);

      // TODO: decimals
      const amountsOut = await router.methods
        .getAmountsOut(10n ** 8n, pairTokens)
        .call();

      const ldtPrice = await this.drizzleDev
        .select()
        .from(schema.prices)
        .where(eq(schema.prices.symbol, 'LDT'));

      this.logger.log('[LiraSwap ethPrice] ' + ldtPrice[0].price);
      this.logger.log('[LiraSwap amountsOut] ' + amountsOut);

      const liraValues = {
        symbol: 'LIRA',
        price: new BigNumber(amountsOut[1])
          .div(10 ** 18)
          .times(ldtPrice[0].price)
          .toString(),
        volume: '0',
        marketCap: '0',
      };

      this.logger.log('[LiraSwap liraValues]', liraValues);
      this.drizzleDev
        .insert(schema.prices)
        .values(liraValues)
        .onConflictDoUpdate({
          target: schema.prices.symbol,
          set: liraValues,
        })
        .then(() => this.logger.debug('updated lira price'))
        .catch((err) => this.logger.error('error updating lira price', err));
    });

    liraPair.events.Swap().on('connected', (connected) => {
      this.logger.log('[LiraSwap] connected: ' + connected);
    });
  }

  async listenToTbbPairEvents() {
    const chainId = await this.web3.getChainId();

    const tbbPairAddress = Object.keys(dexPairs[chainId.toString()])[3];

    const tbbPair = new this.web3.socket.eth.Contract(
      UniswapV2Pair.abi,
      tbbPairAddress,
    );

    const router = new this.web3.rpc.eth.Contract(
      UniswapV2Router02.abi,
      dexAddress[chainId.toString()].router,
    );

    tbbPair.events.Swap().on('data', async (data) => {
      this.logger.log('[TbbSwap] ', data);

      const pair = new this.web3.rpc.eth.Contract(
        UniswapV2Pair.abi,
        tbbPairAddress,
      );

      // TODO: remove when token table is present
      const token0 = await pair.methods.token0().call();
      const token1 = await pair.methods.token1().call();

      const pairTokens =
        token0 !== tokens[chainId.toString()].ldt
          ? [token0, token1]
          : [token1, token0];

      this.logger.log('[TbbSwap pair]', pair);
      this.logger.log('[TbbSwap pairTokens]', pairTokens);

      // TODO: decimals
      const amountsOut = await router.methods
        .getAmountsOut(10n ** 18n, pairTokens)
        .call();

      const ldtPrice = await this.drizzleDev
        .select()
        .from(schema.prices)
        .where(eq(schema.prices.symbol, 'LDT'));

      this.logger.log('[TbbSwap ethPrice] ' + ldtPrice[0].price);
      this.logger.log('[TbbSwap amountsOut] ' + amountsOut);

      const tbbValues = {
        symbol: 'TBb',
        price: new BigNumber(amountsOut[1])
          .div(10 ** 18)
          .times(ldtPrice[0].price)
          .toString(),
        volume: '0',
        marketCap: '0',
      };

      this.logger.log('[TbbSwap tbbValues]', tbbValues);
      this.drizzleDev
        .insert(schema.prices)
        .values(tbbValues)
        .onConflictDoUpdate({
          target: schema.prices.symbol,
          set: tbbValues,
        })
        .then(() => this.logger.debug('updated lira price'))
        .catch((err) => this.logger.error('error updating lira price', err));
    });

    tbbPair.events.Swap().on('connected', (connected) => {
      this.logger.log('[TbbSwap] connected: ' + connected);
    });
  }

  async listenToTbsPairEvents() {
    const chainId = await this.web3.getChainId();

    const tbsPairAddress = Object.keys(dexPairs[chainId.toString()])[4];

    const tbsPair = new this.web3.socket.eth.Contract(
      UniswapV2Pair.abi,
      tbsPairAddress,
    );

    const router = new this.web3.rpc.eth.Contract(
      UniswapV2Router02.abi,
      dexAddress[chainId.toString()].router,
    );

    tbsPair.events.Swap().on('data', async (data) => {
      this.logger.log('[TbsSwap] ', data);

      const pair = new this.web3.rpc.eth.Contract(
        UniswapV2Pair.abi,
        tbsPairAddress,
      );

      // TODO: remove when token table is present
      const token0 = await pair.methods.token0().call();
      const token1 = await pair.methods.token1().call();

      const pairTokens =
        token0 !== tokens[chainId.toString()].ldt
          ? [token0, token1]
          : [token1, token0];

      this.logger.log('[TbsSwap pair]', pair);
      this.logger.log('[TbsSwap pairTokens]', pairTokens);

      // TODO: decimals
      const amountsOut = await router.methods
        .getAmountsOut(10n ** 18n, pairTokens)
        .call();

      const ldtPrice = await this.drizzleDev
        .select()
        .from(schema.prices)
        .where(eq(schema.prices.symbol, 'LDT'));

      this.logger.log('[TbsSwap ethPrice] ' + ldtPrice[0].price);
      this.logger.log('[TbsSwap amountsOut] ' + amountsOut);

      const tbsValues = {
        symbol: 'TBs',
        price: new BigNumber(amountsOut[1])
          .div(10 ** 18)
          .times(ldtPrice[0].price)
          .toString(),
        volume: '0',
        marketCap: '0',
      };

      this.logger.log('[TbsSwap tbgValues]', tbsValues);
      this.drizzleDev
        .insert(schema.prices)
        .values(tbsValues)
        .onConflictDoUpdate({
          target: schema.prices.symbol,
          set: tbsValues,
        })
        .then(() => this.logger.debug('updated tbs price'))
        .catch((err) => this.logger.error('error updating tbs price', err));
    });

    tbsPair.events.Swap().on('connected', (connected) => {
      this.logger.log('[TbsSwap] connected: ' + connected);
    });
  }

  async listenToTbgPairEvents() {
    const chainId = await this.web3.getChainId();

    const tbgPairAddress = Object.keys(dexPairs[chainId.toString()])[5];

    const tbgPair = new this.web3.socket.eth.Contract(
      UniswapV2Pair.abi,
      tbgPairAddress,
    );

    const router = new this.web3.rpc.eth.Contract(
      UniswapV2Router02.abi,
      dexAddress[chainId.toString()].router,
    );

    tbgPair.events.Swap().on('data', async (data) => {
      this.logger.log('[TbgSwap] ', data);

      const pair = new this.web3.rpc.eth.Contract(
        UniswapV2Pair.abi,
        tbgPairAddress,
      );

      // TODO: remove when token table is present
      const token0 = await pair.methods.token0().call();
      const token1 = await pair.methods.token1().call();

      const pairTokens =
        token0 !== tokens[chainId.toString()].ldt
          ? [token0, token1]
          : [token1, token0];

      this.logger.log('[TbgSwap pair]', pair);
      this.logger.log('[TbgSwap pairTokens]', pairTokens);

      // TODO: decimals
      const amountsOut = await router.methods
        .getAmountsOut(10n ** 18n, pairTokens)
        .call();

      const ldtPrice = await this.drizzleDev
        .select()
        .from(schema.prices)
        .where(eq(schema.prices.symbol, 'LDT'));

      this.logger.log('[TbgSwap ethPrice] ' + ldtPrice[0].price);
      this.logger.log('[TbgSwap amountsOut] ' + amountsOut);

      const tbgValues = {
        symbol: 'TBg',
        price: new BigNumber(amountsOut[1])
          .div(10 ** 18)
          .times(ldtPrice[0].price)
          .toString(),
        volume: '0',
        marketCap: '0',
      };

      this.logger.log('[TbgSwap tbgValues]', tbgValues);
      this.drizzleDev
        .insert(schema.prices)
        .values(tbgValues)
        .onConflictDoUpdate({
          target: schema.prices.symbol,
          set: tbgValues,
        })
        .then(() => this.logger.debug('updated tbg price'))
        .catch((err) => this.logger.error('error updating tbg price', err));
    });

    tbgPair.events.Swap().on('connected', (connected) => {
      this.logger.log('[TbgSwap] connected: ' + connected);
    });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    this.logger.debug('start updating prices');

    const prices = await this.getCoinMarketCapPrices();

    // handle btc price
    if (prices.data && prices.data['1'].quote) {
      const priceBtc = prices.data['1'].quote.USD;

      const btcValues = {
        symbol: 'BTC',
        price: priceBtc.price.toString(),
        volume: priceBtc.volume_24h.toString(),
        marketCap: priceBtc.market_cap.toString(),
      };

      this.drizzleDev
        .insert(schema.prices)
        .values(btcValues)
        .onConflictDoUpdate({
          target: schema.prices.symbol,
          set: btcValues,
        })
        .then(() => this.logger.debug('updated btc price'))
        .catch((err) => this.logger.error('error updating btc price', err));

      const wbtcValues = {
        symbol: 'WBTC',
        price: priceBtc.price.toString(),
        volume: priceBtc.volume_24h.toString(),
        marketCap: priceBtc.market_cap.toString(),
      };

      this.drizzleDev
        .insert(schema.prices)
        .values(wbtcValues)
        .onConflictDoUpdate({
          target: schema.prices.symbol,
          set: wbtcValues,
        })
        .then(() => this.logger.debug('updated btc price'))
        .catch((err) => this.logger.error('error updating btc price', err));
    }

    // handle eth price
    if (prices.data && prices.data['1027']) {
      const priceEth = prices.data['1027'].quote.USD;

      const ethValues = {
        symbol: 'ETH',
        price: priceEth.price.toString(),
        volume: priceEth.volume_24h.toString(),
        marketCap: priceEth.market_cap.toString(),
      };

      const wethValues = {
        symbol: 'WETH',
        price: priceEth.price.toString(),
        volume: priceEth.volume_24h.toString(),
        marketCap: priceEth.market_cap.toString(),
      };

      this.drizzleDev
        .insert(schema.prices)
        .values(ethValues)
        .onConflictDoUpdate({
          target: schema.prices.symbol,
          set: ethValues,
        })
        .then(() => this.logger.debug('updated eth price'))
        .catch((err) => this.logger.error('error updating eth price', err));

      this.drizzleDev
        .insert(schema.prices)
        .values(wethValues)
        .onConflictDoUpdate({
          target: schema.prices.symbol,
          set: wethValues,
        })
        .then(() => this.logger.debug('updated weth price'))
        .catch((err) => this.logger.error('error updating weth price', err));
    }
  }

  async getCoinMarketCapPrices(): Promise<CoinMarketCapPricesResponse> {
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
