#!/bin/bash

# Clone the Shardeum repository
git clone https://github.com/shardeum/shardeum.git
cd shardeum

# Checkout the dev branch
git checkout dev

# Install Node.js (specific version)
if ! node --version | grep -q "v18.16.1"; then
    echo "Node.js v18.16.1 not found, installing..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    sudo npm install -g n
    sudo n 18.16.1
fi

# Verify Node.js version
node --version

# Install npm (specific version)
if ! npm --version | grep -q "9.5.1"; then
    echo "npm v9.5.1 not found, installing..."
    sudo npm install -g npm@9.5.1
fi

# Verify npm version
npm --version

# Install Yarn (if not already installed)
if ! command -v yarn &> /dev/null; then
    echo "Yarn not found, installing..."
    sudo npm install -g yarn
fi

# Install Rust (specific version)
if ! rustc --version | grep -q "1.74.1"; then
    echo "Rust 1.74.1 not found, installing..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
    rustup toolchain install 1.74.1
    rustup default 1.74.1
fi

# Verify Rust version
rustc --version

# Install project dependencies
npm ci

# Build the project
npm run prepare

# Install build dependencies for Rust (on Debian/Ubuntu systems)
sudo apt-get update
sudo apt-get install -y build-essential

# Apply the debug-10-nodes.patch
git apply debug-10-nodes.patch
shardus start 10

# Reset the data using the dataRestore.ts script
sudo npm install -g ts-node

echo "Resetting data using dataRestore.ts..."
ts-node -e 'import { createTargetDB } from "./scripts/dataRestore"; createTargetDB("./instances").then(() => console.log("Data reset complete."));'
