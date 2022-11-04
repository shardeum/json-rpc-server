# Starting rpc server

`npm run start`

## DEBUG endpoints

These api are protected preventing general public to wiping out debug data to authenticate use `/authenticate/:passphrase`. `passphrase` is set in `config.ts` config file or within the system env variable.

`/log/api-stats` this endpint emit the rpc interface call counts and avg tps along with a few a other information. This endpoint support query by time range. i.e `/log/api-stats?start={x}&end={x}`. The parameter value can be either `yyyy-mm-dd` or unix epoch in millisecond. (NOTE standard unix epoch is in seconds which does not work, it has to be in millisecond accuracy)

`/log/api-stats-reset` this endpoint trigger the reseting of data that hold api perf stats.

`/log/txs` this endpoint return the txs it has been made through rpc server. This endpoint support dynmaic pagination. i.e `/log/txs?max=30&page=9`.
Default values are `1000` for `max` and `0` for page.

`/log/cleanLogDB` this endpoint wipe the db holding the tx data

`/log/startTxCapture` this endpoint set the config value to true which control whether to capture incoming txs and store in database. 

`/log/stopTxCapture` this endpoint set the config value to false which control whether to capture incoming txs and store in database

