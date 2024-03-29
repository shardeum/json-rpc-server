# Shardeum Server [![Node][node-badge]][node] [![license][license-badge]][license] 

[license]: LICENSE
[license-badge]: https://img.shields.io/badge/License-MIT-blue.svg
[node]: https://nodejs.org/en
[node-badge]: https://img.shields.io/badge/Node-16.11.1-brightgreen.svg

![banner](./img/banner.png)

## Overview
The Shardeum JSON-RPC Server is a lightweight server providing a JSON-RPC interface for interacting with the Shardeum blockchain network. It allows developers to post requests to the Shardeum chain, obtain information and perform multiple other operations using JSON-RPC over HTTP. Additionally, the server provides REST APIs for debugging and monitoring purposes.

## What's Inside
The Shardeum JSON-RPC Server exposes the following services:
- [JSON-RPC API](docs/jsonrpc-api.md).: A lightweight server providing a JSON-RPC interface for interacting with the Shardeum blockchain network.
- [REST API](docs/rest-api.md): REST APIs for debugging and monitoring purposes.

The full specification for the APIs is available in the [docs](docs) folder.

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

## Getting Started
The recommended way to run The Shardeum JSON-RPC Server is using [Docker](https://www.docker.com/). This will ensure that all dependencies are installed and that the server is running in a consistent environment. Optionally, you can also install the server locally using [npm](https://www.npmjs.com/).

### Requirements
In order to run The Shardeum JSON-RPC Server you must install the following:
- [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git) - A distributed version control system.
- [Docker](https://www.docker.com/) - A containerization platform.

Additionally, you should have [make](https://man7.org/linux/man-pages/man1/make.1.html) installed.

### Installation
In order to install the server, run the following command:
```sh
git clone https://gitlab.com/shardeum/json-rpc-server
cd shardeum-json-rpc
make build
```
You should now have built docker images the service.

### Setup
The server expects a [Shardum Archive node](https://shardeum.org/blog/shardeum-archive-nodes-explained/) to be running on the same machine. Archive nodes maintain the entire transaction history. Archive nodes may or may not have to stake SHM, but they will earn a portion of the network reward to motivate and incentivize for storing historical data. Please check the official documentation for instructions on [how to setup an archive node](https://docs.shardeum.org/node/run/archive). 

Alternatively, you can use the [shardus CLI tool](https://docs.shardus.com/docs/quickstart) to setup a local node cluster.
```sh
shardus create 1
```
The above command will create a local node cluster with 1 node. You can specify the number of nodes you want to create by changing the number in the command.

### Running
Afterwards, you can start the server, by running the following command:
```sh
make run
```
This will start a container running the `shardeum-json-rpc` server image,  available on port `8080`.
The servers configuration fields can be viewed and edited in the `src/config.ts` file. Additinaly, the `whitelist.json`, `blacklist.json` and `spammerlist.json` can be edited to manage the servers access control lists.

### Usage
Currently, no default client application is provided. You can develop you own based on the available endpoints or you can use `curl`:
```bash
curl http://localhost:8080 \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getBalance",\
  "params":["0x507877C2E26f1387432D067D2DaAfa7d0420d90a"],"id":1}'
```

#### Sending a Request
To invoke an RPC method, send a POST request to `http://localhost:8080`, with this or an equivalent format:

```json
{
  "jsonrpc": "2.0",
  "method": "method_name",
  "params": ["value1", "value2" ],
  "id": 1
}
```

Just replace the fields `"method_name"`, `"param1"`, `"value1"`, etc., with the relevant method and parameters you want to use.

__Example Request:__
```json
{
  "jsonrpc": "2.0",
  "method": "eth_getBalance",
  "params": [ "your_wallet_address" ],
  "id": 1
}
```

__Example Response:__
```json
{
  "jsonrpc": "2.0",
  "result": "0x10",
  "id": 1
}
```

### Cleanup
You can stop the server by running:
```sh
make stop
```

Additionally, you can remove the docker images by running:
```sh
make clean
```

This will remove all docker images created by the server during the build process.


## About Us
Shardeum is the world's first EVM-based L1 smart contract platform that scales linearly through dynamic state sharding and maintains low gas fees forever. You can learn more about us on our [website](https://shardeum.org/).

![banner](./img/banner.png)