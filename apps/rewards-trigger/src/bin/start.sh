#!/usr/bin/env bash

RPC_URL=rpc-urt \
WALLET_ADDRESS=wallet-address \
WALLET_PRIVATE_KEY=wallet-private-key \
docker compose up -d && docker compose logs -f
