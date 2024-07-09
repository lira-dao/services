import { Injectable } from '@nestjs/common';
import Web3 from 'web3';

@Injectable()
export class Web3Service {
  private web3: Web3;
  private web3Ws: Web3;

  constructor() {
    this.web3 = new Web3(process.env.RPC_URL);

    this.web3.eth
      .getChainId()
      .then((chainId) => {
        console.log(`Currently connected to chain ID: ${chainId}`);
      })
      .catch((err) => {
        console.error('Failed to get chain ID:', err);
      });
  }

  getWeb3Instance(): Web3 {
    return this.web3;
  }

  getWeb3WsInstance(): Web3 {
    return this.web3Ws;
  }
}
