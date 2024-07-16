# Shardeum Automated Testing Documentation

## Overview

This documentation covers the setup and execution of automated tests for JSON-RPC methods in the Shardeum JSON RPC Server. The goal is to ensure that Shardeum's implementation adheres to expected behaviors in handling blockchain transactions via JSON-RPC.

## Goals

- Test all JSON-RPC functions to ensure that they perform as expected.
- Verify the Shardus network connectivity and functionality.
- Ensure proper transaction handling and balance updates.

## Test Script Overview

The test script is designed to prepare an environment that is suitable for running the JSON RPC tests. Here is a breakdown of its functionality:

1. **Environment Preparation**:

   - Checks for and uses NVM (Node Version Manager).
   - Installs Node.js v18.16.1 if not present.
   - Installs Rust if missing (version 1.74.1).
   - Installs necessary build tools (build-essential on Linux, gcc on macOS).

2. **Repository Management**:

   - Uses an existing Shardeum project if specified, otherwise it clones a fresh copy from the Shardeum repository.
   - Applies a debug patch for 10-node setup.

3. **Dependency Installation**:

   - Runs `npm ci` to install all project dependencies.
   - Installs the Shardus CLI tool and the Shardus Archiver if not found.

4. **Network Initialization**:
   - Starts a Shardus network with 10 nodes.
   - Waits for 4 minutes to allow network stabilization.
   - Runs the tests

### Test Execution

Once the environment is set up, the tests are executed using Jest. These tests primarily interact with the `extendedServer` instance defined in the `server.ts` file. It handles JSON-RPC requests and performs the blockchain operations in the tests. Each test file imports its own instance of the RPC server and executes against it.

Each RPC call has its own test file in the `src/__tests__` directory. Each file contains multiple test cases covering different aspects and edge cases for each RPC method.

### Run Tests

The tests typically run automatically through the test script, however, you can run the tests manually by executing the `npm test` command in the JSON RPC Server project. [More on how to run tests here ](https://github.com/shardeum/json-rpc-server/blob/localtest/README.md#running-tests).

## Expand the Test Suite

- **Add New Tests**: New tests can be added by creating new test files under the `src/__tests__` directory. Each new file should mimic the structure of existing tests, initializing its setup, defining the RPC calls, and tearing down after tests.
- **Modifying Existing Tests**: To modify existing tests, locate the relevant test file and add or adjust test cases as needed. Be mindful of potential side effects on other tests due to shared state or network conditions.
- **Enhancing Test Coverage**: Increase coverage by adding more scenarios and edge cases, particularly focusing on error handling and failure modes.
