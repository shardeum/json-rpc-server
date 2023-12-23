# Starting rpc server

`npm run start`

## Docker setup

> Make sure necessary components which are required to run json-rpc-server are smoke testing stack in networking mode host

env `NO_OF_RPC_SERVERS` creates replicas of rpc servers using pm2. default is 1. Default port is 8080, port for each replicas will increment by 1 on default port. i.e 8081, 8082, 8083, etc.

Start json-rpc-server

```shell
# Run services in detach mode
docker compose up -d
```

Check the logs

```shell
docker compose logs -f
```

Clean the setup

```shell
docker compose down
```

## DEBUG endpoints

These api are protected preventing general public to wiping out debug data to authenticate use `/authenticate/:passphrase`. `passphrase` is set in `config.ts` config file or within the system env variable.

GET `/log/api-stats` this endpint emit the rpc interface call counts and avg tps along with a few a other information. This endpoint support query by time range. i.e `/log/api-stats?start={x}&end={x}`. The parameter value can be either `yyyy-mm-dd` or unix epoch in millisecond. (NOTE standard unix epoch is in seconds which does not work, it has to be in millisecond accuracy). Not setting any timestamp parameter will returns paginated json of all the entry in db.

GET `/log/txs` this endpoint return the txs it has been made through rpc server. This endpoint support dynmaic pagination. i.e `/log/txs?max=30&page=9`.
Default values are `1000` for `max` and `0` for page.

GET `/log/status` this endpint return status of logging such as date of recording start and whether or not recording is enabled.

GET `/log/startTxCapture` this endpoint set the config value to true which control whether to capture incoming txs and store in database.

GET `/log/stopRPCCapture` this endpoint set the config value to false which control whether to capture incoming rpc interface call stat and store in database

GET `/log/startRPCCapture` this endpoint set the config value to true which control whether to capture rpc interface call stat and store in database.

GET `/log/stopTxCapture` this endpoint set the config value to false which control whether to capture incoming txs and store in database

GET `/cleanStatTable` this endpoint trigger purging of table that store interface stats

GET `/cleanTxTable` this endpoint trigger purging of table that store transaction logging
