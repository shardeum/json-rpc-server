#!/bin/bash

# Ensure nvm is loaded
export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
# Load nvm if it's installed
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Define your local repository path and the link path
if [ -z "$1" ]; then
    # Default value if $1 is not provided
    # Example: REPO_URL="/Users/username/Documents/shardeum/repo"
    REPO_URL="/path/to/your/local/shrdeum/repo"
else
    # Use the value of $1 if provided
    REPO_URL="$1"
fi

REPO_NAME="json-rpc-server"

# Check if the directory exists
if [ -d "$REPO_URL" ]; then
    echo "Repository path exists: $REPO_URL"
else
    echo "Error: Repository path does not exist or is not a directory: $REPO_URL"
    # Create a new path relative to the current directory
    NEW_PATH="./os/test"
    
    # Create the directory if it does not exist
    if mkdir -p "$NEW_PATH"; then
        echo "Created new path: $NEW_PATH"
        REPO_URL="$NEW_PATH"
        cd $REPO_URL

        # Git clone the repository
        git clone https://github.com/shardeum/json-rpc-server.git
        echo "Cloned json-rpc repository successfully"

        git clone https://github.com/shardeum/shardeum.git
        echo "Cloned shardeum repository successfully"
        REPO_URL="$NEW_PATH"
    else
        echo "Failed to create new path: $NEW_PATH"
        exit 1  # Exit the script with an error code
    fi
fi

# Navigate to the linked repository
cd shardeum

# # Checkout the dev branch
 git checkout dev

# Install Node.js (specific version), installing or setting to v18.16.1 also sets npm to 9.5.1
nvm use 18

if node --version | grep -q "v18"; then
    echo "Node.js v18 found, setting to v18.16.1..."
    node --version
    nvm install 18.16.1
    nvm use 18.16.1
else
    echo "Node.js v18 not found, installing..."
    if ! command -v brew &> /dev/null; then
        echo "Homebrew not found, installing..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    brew install node@18
    nvm install 18.16.1
    nvm use 18.16.1
fi

# Verify Node.js version
node --version

# Verify npm version
npm --version


# Check if Rust is installed
if command -v rustc &> /dev/null; then
    echo "Rust found, version:"
    rustc --version
else
    echo "Rust not found, installing..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
    rustup toolchain install 1.74.1
    rustup default 1.74.1
fi

# Verify Rust version
rustc --version

install_linux() {
    sudo apt-get update
    sudo apt-get install build-essential
}

install_macos() {
    brew update
    if ! command -v gcc &> /dev/null; then
        echo "gcc not found, installing..."
        brew install gcc
    else
        echo "gcc already installed, skipping..."
    fi
}

# Detect the operating system
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Detected Linux OS"
    install_linux
elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Detected macOS"
    install_macos
else
    echo "Unsupported OS: $OSTYPE"
    exit 1
fi

# Install project dependencies
npm ci

# Apply the debug-10-nodes.patch 
git apply debug-10-nodes.patch

# Build the project
npm run prepare

npm install -g shardus
npm install -g @shardus/archiver
echo "Installed shardus dependencies"


# Start the shardus network
shardus start 10
echo "Started 10 nodes with shardus"

# Wait for 5 minutes, this allows the network to initialize healthy archivers for the json rpc server to connect to.
# The json rpc server will not be able to connect to the network if the archivers are not healthy.

echo "Waiting for 5 minutes before starting the json rpc server"
sleep 300 

# Change directory back to json-rpc-server and run the test suite
cd ..
echo "leaving shardeum directory"
cd $REPO_NAME

echo "Switching to localtest branch"
git switch localtest

echo "now installing deps..."
npm ci

echo "Finished installing jrpc dependencies, now starting the server..."
npm run start

# Wait for 90 seconds
echo "Waiting for 90 seconds before running the test suite..."
sleep 90

npm run test
echo "Test suite completed."