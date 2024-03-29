# REST APIs
![banner](../img/banner.png)

## Overview
In addition to the JSON-RPC interface, the Shardeum JSON-RPC Server also provides REST APIs for debugging and monitoring purposes. It allows developers to query the Shardeum chain, obtain information and perform multiple other operations using REST over HTTP. Instructions on setting up and running the Shardeum Server can be [here](../README.md).

## Authentication
The REST APIs are protected by a passphrase. The passphrase can be set in the `config.ts` file or in the system environment variable. After setting the passphrase, you can authenticate by sending a POST request to `/authenticate/:passphrase`. If the passphrase is correct, the server will respond with a JSON object containing the authentication token. The token is valid for 30 days and can be used to access the REST API endpoints. Additinally, a cookie will be set in the browser for the same duration.

## Endpoints
The REST API endpoints are listed below.

__Authentication API Endpoints:__
- **GET `/authenticate/:passphrase`**: Authenticates user for the debug endpoints. Returns the JWT token if successful. 
- **GET `/authenticate/token-check/:token`**: Verifies if JWT token is valid. Returns if the token is valid.

__Core API Endpoints:__
- **GET `/dashboard`**: Dashboard endpoint. Returns the HTML with with the dashboard page. This endpoint depends on rpc-gateway-frontend which is available in another repository
- **GET `/api/health`**: Health check endpoint. Returns `{ healthy: true }` with status code `200` if the server is running.
- **GET `/api/subscribe`**: Subscribes to a new node. Requires `ip` and `port` query parameters. Returns `200` if successful.

__Debug API Endpoints:__
- **GET `/log/api-stats`**: Returns RPC interface call counts, average TPS, and other data. Supports time range queries (`yyyy-mm-dd` or milliseconds). Default: paginated all entries.
- **GET `/log/txs`**: Retrieves transactions made through RPC server. Supports dynamic pagination (`max`, `page` parameters). Defaults to `max=1000` and `page=0`.
- **GET `/log/status`**: Reports logging status, including start date and recording status.
- **GET `/log/startTxCapture`**: Captures incoming transactions.
- **GET `/log/stopRPCCapture`**: Disables incoming transactions.
- **GET `/log/startRPCCapture`**: Enables incoming RPC interface call stat capture.
- **GET `/log/stopTxCapture`**: Disables transaction capture.
- **GET `/log/cleanStatTable`**: Triggers purging of the stat storage table.
- **GET `/log/cleanTxTable`**: Initiates purging of the transaction log table.
