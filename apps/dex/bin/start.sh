#!/usr/bin/env bash

pnpm build

docker compose build --no-cache

RPC_URL=rpc-url \
WS_URL=ws-url \
CMC_API_KEY=cmc-api-key \
POSTGRES_URL=postgres-url \
VIRTUAL_HOST=virtual-host \
LETSENCRYPT_HOST=host \
LETSENCRYPT_EMAIL=email \
docker compose up -f docker-compose-prd.yml -d && docker compose logs -f
