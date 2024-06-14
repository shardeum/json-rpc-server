## Overview

The Shardeum JSON-RPC Server enables developers to interact with the Shardeum blockchain network. It allows dapps to post requests, retrieve information, and perform other related operations using JSON-RPC over HTTP. Additionally, the Shardeum JSON-RPC Server comes with an added REST API for debugging and monitoring purposes.

For running existing dapps on Shardeum, refer to the [EVM JSON-RPC API](https://ethereum.org/en/developers/docs/apis/json-rpc/).

## Table of Contents

- [Project Structure](#project-structure)
- [Docker Setup](#docker-setup)
  - [Start JSON-RPC Server](#start-json-rpc-server)
  - [Check the Logs](#check-the-logs)
  - [Clean the Setup](#clean-the-setup)
- [Developer Environment Setup](#developer-environment-setup)
  - [Requirements](#requirements)
  - [Installing Project Source Code](#installing-project-source-code)
  - [Starting JSON-RPC Server](#starting-json-rpc-server)
  - [Cleanup](#cleanup)
- [Usage](#usage)
  - [REST API Endpoints](#rest-api-endpoints)
  - [Debug Endpoints](#debug-endpoints)
- [Configuration](#configuration)
- [Notable Modules and Functions](#notable-modules-and-functions)
  - [api.ts](#apits)
  - [clients.ts](#clientsts)
  - [index.ts](#indexts)
  - [log_server.ts](#log_serverts)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## Project Structure

The project is organized as follows:

```
json-rpc-server-dev/
├── .appsec/                 # Security baseline configurations
├── src/                     # Source code
│   ├── api.ts               # Main API implementation
│   ├── config.ts            # Configuration settings
│   ├── logger.ts            # Logging utility
│   ├── server.ts            # Server setup and initialization
│   ├── types.ts             # Type definitions
│   ├── utils/               # Utility functions
│   ├── cache/               # Cache management
│   ├── external/            # External service integrations
│   ├── middlewares/         # Middleware functions
│   ├── routes/              # API routes
│   ├── service/             # Core service implementations
│   ├── storage/             # Storage solutions
│   ├── websocket/           # WebSocket implementations
├── Dockerfile               # Docker configuration
├── docker-compose.yml       # Docker Compose configuration
├── README.md                # Project documentation
├── package.json             # Project metadata and dependencies
└── tsconfig.json            # TypeScript configuration
```

## Docker Setup

For developers deploying to production environments, use the `docker compose` command. The environment variable `NO_OF_RPC_SERVERS` creates replicas of RPC servers using PM2. The default is 1. The default port is 8080, and ports for each replica will increment by 1 (e.g., 8081, 8082, 8083).

### Start JSON-RPC Server

```shell
# Run services in detach mode
docker compose up -d
```

### Check the Logs

```shell
docker compose logs -f
```

### Clean the Setup

```shell
docker compose down
```

## Developer Environment Setup

For end users, such as exchanges and large decentralized applications (dApps), seeking to deploy their own RPC server, it is recommended to run the Shardeum JSON-RPC server using Docker. It ensures all dependencies are installed and the server is running in a consistent environment. For developers who want to contribute to this project, running the server from source is recommended. You can use `npm` for installing the server locally.

### Requirements

To run the Shardeum JSON-RPC server, you must have the [Docker](https://docs.docker.com/get-docker/) daemon installed.

### Installing Project Source Code

Follow these steps to install the project source code and switch to the `dev` branch:

```bash
git clone https://github.com/shardeum/json-rpc-server.git
cd shardeum-json-rpc
git switch dev
```

### Building the Project

- **Using Docker**:

    ```bash
    make build
    ```

    This command will build Docker images for the service.

- **Using NPM**:

    ```bash
    npm install
    ```

    This command will install all the required dependencies.

### Starting JSON-RPC Server

- **Using Docker**:

    ```bash
    make run
    ```

    This will start a container running the `shardeum-json-rpc` server image, available on port `8080`. Configuration fields can be viewed and edited in the `src/config.ts` file. Manage the server's access control lists by editing the `whitelist.json`, `blacklist.json`, and `spammerlist.json`.

- **Using NPM**:

    ```bash
    npm run start
    ```

    Modify the `chainId` or the `port` number in the `src/config.ts` file:

    ```typescript
    chainId: 8082
    port: 8080
    ```

    The RPC URL for using Metamask with Remix IDE and for running scripts is <http://localhost:port> (default: <http://localhost:8080>).

    For contributing to this project, use the Shardeum server to create the network from within the [validator repo](https://gitlab.com/shardus/archive/archive-server). More details can be found [here](https://github.com/shardeum/shardeum).

### Cleanup

- **Using Docker**:

    ```bash
    make stop
    ```

    Remove the Docker images by running:

    ```bash
    make clean
    ```

    This will remove all Docker images created by the server during the build process.

## Usage

### REST API Endpoints

- **GET `/authenticate/:passphrase`**: Authenticate using the `passphrase` set in `config.ts` or system environment variable.
- **GET `/log/api-stats`**: Emit RPC interface call counts, average TPS, and other information. Supports querying by time range (`/log/api-stats?start={x}&end={x}`).
- **GET `/log/txs`**: Return the transactions made through the RPC server. Supports dynamic pagination (`/log/txs?max=30&page=9`).
- **GET `/log/status`**: Return the status of logging.
- **GET `/log/startTxCapture`**: Enable capturing of incoming transactions.
- **GET `/log/stopTxCapture`**: Disable capturing of incoming transactions.
- **GET `/log/startRPCCapture`**: Enable capturing of RPC interface call stats.
- **GET `/log/stopRPCCapture`**: Disable capturing of RPC interface call stats.
- **GET `/cleanStatTable`**: Trigger purging of the stats table.
- **GET `/cleanTxTable`**: Trigger purging of the transactions table.

### Debug Endpoints

These APIs are protected, preventing the general public from wiping out debug data. To authenticate, use `/authenticate/:passphrase`. The `passphrase` is set in `config.ts` or within the system environment variable.

- **GET `/log/api-stats`**: Emits RPC interface call counts and average TPS along with other information. Supports query by time range (e.g., `/log/api-stats?start={x}&end={x}`). The parameter value can be either `yyyy-mm-dd` or Unix epoch in milliseconds.
- **GET `/log/txs`**: Returns the transactions made through the RPC server. Supports dynamic pagination (e.g., `/log/txs?max=30&page=9`). Default values are `1000` for `max` and `0` for `page`.
- **GET `/log/status`**: Returns the status of logging, such as the date of recording start and whether or not recording is enabled.
- **GET `/log/startTxCapture`**: Sets the config value to true, enabling the capture of incoming transactions.
- **GET `/log/stopTxCapture`**: Sets the config value to false, disabling the capture of incoming transactions.
- **GET `/log/startRPCCapture`**: Sets the config value to true, enabling the capture of RPC interface call stats.
- **GET `/log/stopRPCCapture`**: Sets the config value to false, disabling the capture of RPC interface call stats.
- **GET `/cleanStatTable`**: Triggers purging of the table that stores interface stats.
- **GET `/cleanTxTable`**: Triggers purging of the table that stores transaction logging.

## Configuration

Important configuration files and parameters:

- **`config.ts`**: Contains various configuration settings for the server.
- **Environment Variables**:
  - `NO_OF_RPC_SERVERS`: Number of RPC server replicas (default is 1).
  - `PORT`: Port number for the server (default is 8080).

## Notable Modules and Functions

### `api.ts`

- **Core RPC Methods**: Handles various JSON-RPC methods such as `eth_call`, `eth_sendTransaction`, and more.
- **Utilities**: Includes utility functions for validating addresses, handling transactions, and interacting with the Ethereum ecosystem.
- **Error Handling**:

 Uses `serializeError` to format and return errors in a standardized way.

### `clients.ts`

- **ClientList Class**: Manages active WebSocket clients and their subscription details.
- **Subscription Management**: Provides methods to add, remove, and manage client subscriptions.
- **Mapping**: Maps subscription IDs to request IDs and vice versa for efficient lookup and management.

### `index.ts`

- **WebSocket Server Setup**: Initializes and manages WebSocket server connections.
- **Event Handling**: Manages events for incoming connections, message handling, and disconnections.
- **Subscription Integration**: Uses `ClientList` to manage subscriptions and emit data to clients.

### `log_server.ts`

- **Log Server Connection**: Sets up and maintains WebSocket connection to the log server.
- **Event Handling**: Manages events for log-related messages.
- **Configuration Integration**: Uses configuration settings to manage log stream setup and maintenance.

## Contributing

Contributions are very welcome! Everyone interacting in our codebases, issue trackers, and any other form of communication, including chat rooms and mailing lists, is expected to follow our [code of conduct](CODE_OF_CONDUCT.md) so we can all enjoy the effort we put into this project.

## License

This project is licensed under the terms of the [MIT license](LICENSE).

## Contact

For any questions or suggestions, feel free to reach out to us at [support@shardeum.org](mailto:support@shardeum.org).
