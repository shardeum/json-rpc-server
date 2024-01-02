#!/bin/bash -x

NO_OF_RPC_SERVERS=${NO_OF_RPC_SERVERS:-1}
RPC_PORT=8080

for i in $(seq $NO_OF_RPC_SERVERS); do
  pm2 start --daemon --name json-rpc-server-${RPC_PORT} npm -- run start ${RPC_PORT}
  RPC_PORT=$(( RPC_PORT + 1 ))
done

exec pm2 logs
