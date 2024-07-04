#!/bin/bash

export NVM_DIR="${XDG_CONFIG_HOME:-${HOME}/.nvm}"

if [ ! -f "$NVM_DIR/nvm.sh" ]; then
    echo "Please install nvm before running this script as Shardeum requires a specific version of node and npm."
    exit 1
fi

# Load nvm
source "$NVM_DIR/nvm.sh"

# Define your local repository path
REPO_PATH="${1:-/path/to/your/local/shardeum/repo}"
REPO_NAME="shardeum"

# Check if the directory exists
if [ -d "$REPO_PATH" ]; then
    echo "Repository path exists: $REPO_PATH"
    pushd "$REPO_PATH"
else
    echo "No existing Shardeum installation found, cloning the repository..."
    pushd "./.test" || mkdir -p "./.test" && pushd "./.test"
    git clone https://github.com/shardeum/shardeum.git || { echo "Failed to clone shardeum repository"; exit 1; }
    pushd "$REPO_NAME"
fi

# Check Node.js version
if ! node --version | grep -q "v18"; then
    echo "Node.js v18 not found, installing and selecting via nvm..."
    nvm install 18.16.1 && nvm use 18.16.1 || { echo "Failed to install/select Node.js v18.16.1"; exit 1; }
fi

# Ensure Rust is installed
if ! command -v rustc &> /dev/null; then
    echo "Rust missing, installing..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
    rustup toolchain install 1.74.1
    rustup default 1.74.1
else
    echo -n "Rust detected, version: "
    rustc --version
fi

# Install build essentials based on OS
install_linux() {
    sudo apt-get update && sudo apt-get install -y build-essential
}

install_macos() {
    if ! command -v brew &> /dev/null; then
        echo "Homebrew is not installed, please install it before running this script."
        exit 1
    fi
    brew update
    brew install gcc
}

case "$OSTYPE" in
    linux-gnu*) install_linux ;;
    darwin*) install_macos ;;
    *) echo "Unsupported OS: $OSTYPE"; exit 1 ;;
esac

# Install project dependencies and apply debug patch
npm ci
git apply debug-10-nodes.patch || { echo "Failed to apply patch"; exit 1; }

# Build the project
npm run prepare

# Install shardus and archiver globally if not already installed
command -v shardus &> /dev/null || npm install -g shardus @shardus/archiver

# Start the shardus network
shardus start 10 || { echo "Failed to start shardus network"; exit 1; }
echo "Started 10 nodes with shardus"

# Wait before starting the JSON RPC server
echo "Waiting for 3 minutes before starting the JSON RPC server"
sleep 180

# Return to the original directory using popd
popd || { echo "Failed to return to /root directory"; exit 1; }

git switch localtest || { echo "Failed to switch to localtest branch"; exit 1; }

echo "Installing json rpc project dependencies..."
npm ci

echo "Starting the JSON RPC server..."
npm run start & # Start the JSON RPC server in the background

echo "Waiting for 90 seconds before running the test suite..."
sleep 90

npm run test || { echo "Test suite failed"; exit 1; }
echo "Test suite completed."
