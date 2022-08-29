# Starting rpc server

`npm run start`

## DEBUG endpoints

These api are protected preventing general public to wiping out debug data to authenticate use `/authenticate/:passphrase`. `passphrase` is set in `config.ts` config file or within the system env variable.

`/log/api-stats` this endpint emit the rpc interface call counts and avg tps along with a few a other information

`/log/api-stats-reset` this endpoint trigger the reseting of data that hold api perf stats.

`/log/txs` this endpoint return the txs it has been made through rpc server 

`/log/cleanLogDB` this endpoint wipe the db holding the tx data

`/log/startTxCapture` this endpoint set the config value to true which control whether to capture incoming txs and store in database. 

`/log/stopTxCapture` this endpoint set the config value to false which control whether to capture incoming txs and store in database

