#!/bin/bash

# Define your local repository path and the link path
REPO_URL="/Users/soniasingla/Desktop/shardeum"
REPO_NAME="../json-rpc-server"

# Create a symbolic link to the local repository
ln -s $REPO_URL $REPO_NAME

# Navigate to the linked repository
cd $REPO_URL

# # Checkout the dev branch
 git checkout local

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


npm install -g shardus
npm update @shardus/archiver
echo "Installed shardus dependencies"

# Apply the debug-10-nodes.patch
git apply debug-10-nodes.patch
echo "Applied instances setup patch"

shardus start 10
echo "started 10 nodes with shardus"

shardus stop
echo "stopped the network"

npm run prepare

echo "compilation completed, about migrating DB"
node dist/scripts/writeDataToDBs.js

echo "migration successful"

shardus start 10