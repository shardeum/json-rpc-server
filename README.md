# Overview

The [Shardeum JSON-RPC Server](https://docs.shardeum.org/docs/node/run/rpc) enables developers to interact with the Shardeum blockchain network. It allows dapps to post request, retrieve information, and other related operations, using JSON-RPC over HTTP. Additionally, the Shardeum JSON-RPC Server comes with an added REST API for debugging and monitoring purposes.

For running existing dapps on Shardeum, refer to EVM [JSON-RPC API](https://ethereum.org/en/developers/docs/apis/json-rpc/)

## Docker setup

For developers deploying to production environments, simply use `docker compose` command.

env `NO_OF_RPC_SERVERS` creates replicas of rpc servers using pm2. default is 1. Default port is 8080, port for each replicas will increment by 1 on default port. i.e 8081, 8082, 8083, etc.

### Start json-rpc-server

```shell
# Run services in detach mode
docker compose up -d
```

### Check the logs

```shell
docker compose logs -f
```

### Clean the setup

```shell
docker compose down
```

## Developer Environment Setup

For end users, such as exchanges and large decentralized applications (dApps), seeking to deploy their own RPC server, it is recommended to run the Shardeum JSON-RPC server using Docker. It ensures all dependencies are installed and the server is running in a consistent environment. For developers who want to contribute to this project, running the server from source is recommended. You can use `npm` for installing the server locally.

### Requirements

If you are using `Docker`, in order to run the Shardeum JSON-RPC server, you must have the [Docker](https://docs.docker.com/get-docker/) daemon installed.

### Installing project source code

Let’s install the project source code, switch to `dev` branch and follow the below instructions:

```bash
git clone https://github.com/shardeum/json-rpc-server.git
cd shardeum-json-rpc
git switch dev
```

If you are building using `Docker`, run the below command:

```bash
make build
```

This command will build Docker images for the service.

If you are building using `NPM`, run the below command, it will install all the required dependencies

```bash
npm install
```

## Starting JSON-RPC Server

If you are building using `Docker`, you can start the JSON-RPC server by running the following command:

```bash
make run
```

This will start a container running the `shardeum-json-rpc` server image, available on port `8080`. The servers configuration fields can be viewed and edited in the `src/config.ts` file. Additionally, you can manage the server's access control lists by editing the `whitelist.json`, `blacklist.json` and `spammerlist.json`.

But if you are using NPM, use the below command to run the server:

```bash
npm run start
```

If you want to modify the chainId or the port number, go to `src/config.ts` file:

```bash
chainId: 8082
port: 8080
```

The RPC URL for using Metamask with Remix IDE and for running scripts is <http://localhost:port> (default: <http://localhost:8080>)

If you are contributing to this project, use Shardeum server to create the network. You can find more details [here](https://github.com/shardeum/shardeum)

## Running Tests

There are two ways to set up the testing environment for the JSON RPC Server: Manual setup and using a Bash script.

### Setting Up the Test Environment Manually

Follow these steps to set up your local environment for testing:

1. Run the Shardeum network locally (find instructions in the [Shardeum Readme.md](https://github.com/shardeum/shardeum/blob/dev/README.md) file).
2. Once your network is running, visit `localhost:4000/cycleinfo/1` to see your network's details.
3. Wait until the network enters processing mode, which happens when the active nodes in the network equals the minimum amount of nodes required (usually around cycle counter 12-14).
4. Once the network is in processing mode, start the JSON RPC server with `npm run start`.
5. Open a new terminal tab and run the tests with `npm run test` to see the test results.

### Using the Bash Script

The Bash script simplifies the process of setting up the test environment. It's particularly useful if you haven't already configured the Shardeum network and the JSON RPC server locally, though it can also be used if you have. The script will manage both situations and execute the tests for you.

To run the script:

1. Clone and set up the JSON RPC Server locally.
2. Navigate to the root of the project: `cd json-rpc-server`.
3. Execute the script: 
    - Run `npm local:test ~/root/path/to/your/shardeum/project` - If you already have a the Shardeum repo installed locally.
    - Run `npm local:test` - If you'd prefer the script to set one up for you.
    - The script will creat a test environment path `/.test` and set up the Shardeum network there.
4. It will then start a network of 10 nodes along with the JSON RPC server, and finally run the test suite.
5. Tests involving transactions on the network will fail if your local network has fewer than 5 active nodes. 
To address this, you can increase the wait time in the script to more than 10 minutes. 
This will give the network sufficient time to reach processing mode with at least 5 active nodes.

A test account with a hardcoded private key is provided in the tests, ensuring that your tests should pass without any extra configuration.

> For detailed information about the tests, check the test files located in `src/__tests__`. Each test file contains specific tests for different parts of the JSON-RPC methods.

## Cleanup

If you are using `Docker`, you can stop the server by running:

```bash
make stop
```

Additionally, you can remove the docker images by running:

```bash
make clean
```

This will remove all docker images created by the server during the build process.

## DEBUG Endpoints

These APIs are protected preventing general public to wiping out debug data to authenticate use `/authenticate/:passphrase`. `passphrase` is set in `config.ts` config file or within the system env variable.

GET `/log/api-stats` this endpoint emits the RPC interface call counts and avg tps along with a few a other information. This endpoint support query by time range. i.e `/log/api-stats?start={x}&end={x}`. The parameter value can be either `yyyy-mm-dd` or unix epoch in millisecond. (NOTE standard unix epoch is in seconds which does not work, it has to be in millisecond accuracy). Not setting any timestamp parameter will return paginated JSON of all the entry in the database.

GET `/log/txs` this endpoint returns the transactions it has been made through the RPC server. This endpoint support dynmaic pagination. i.e `/log/txs?max=30&page=9`.
Default values are `1000` for `max` and `0` for page.

GET `/log/status` This endpoint returns the status of logging such as date of recording start and whether or not recording is enabled.

GET `/log/startTxCapture` This endpoint sets the config value to true which control whether to capture incoming txs and store in database.

GET `/log/stopRPCCapture` This endpoint sets the config value to false which control whether to capture incoming RPC interface call stat and store in database

GET `/log/startRPCCapture` This endpoint sets the config value to true which control whether to capture RPC interface call stat and store in database.

GET `/log/stopTxCapture` This endpoint sets the config value to false which control whether to capture incoming txs and store in database.

GET `/cleanStatTable` This endpoint triggers purging of the table that stores interface stats.

GET `/cleanTxTable` This endpoint triggers purging of the table that stores transaction logging.

## Contributing

Contributions are very welcome! Everyone interacting in our codebases, issue trackers, and any other form of communication, including chat rooms and mailing lists, is expected to follow our [code of conduct](CODE_OF_CONDUCT.md) so we can all enjoy the effort we put into this project.

## Community

For chatting with others using Shardeum: [Join the Shardeum Discord Server](https://discord.com/invite/shardeum)
