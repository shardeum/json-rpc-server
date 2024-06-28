#!/bin/bash

# Ensure nvm is loaded
export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
# Load nvm if it's installed
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Define your local repository path and the link path
if [ -z "$1" ]; then
    # Default value if $1 is not provided
    REPO_URL="/Users/ekene/Desktop/oss-shardeum/shardeum"
else
    # Use the value of $1 if provided
    REPO_URL="$1"
fi

REPO_NAME="../json-rpc-server"

# Check if the directory exists
if [ -d "$REPO_URL" ]; then
    echo "Repository path exists: $REPO_URL"
else
    echo "Error: Repository path does not exist or is not a directory: $REPO_URL"
    # Create a new path relative to the current directory
    NEW_PATH="./os/shardeum-global"
    
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
        REPO_URL="$NEW_PATH/shardeum"
    else
        echo "Failed to create new path: $NEW_PATH"
        exit 1  # Exit the script with an error code
    fi
fi


# Create a symbolic link to the local repository if it doesn't already exist
if [ ! -L $REPO_NAME ]; then
    ln -s $REPO_URL $REPO_NAME
else
    echo "Symbolic link already exists."
fi

# Navigate to the linked repository
cd $REPO_URL

# # Checkout the dev branch
 git checkout dev

# Install Node.js (specific version), installing or setting to v18.16.1 also sets npm to 9.5.1
if node --version | grep -q "v18"; then
    echo "Node.js v18 found, setting to v18.16.1..."
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

# Apply the debug-10-nodes.patch if it hasn't been applied
if ! git apply --check debug-10-nodes.patch; then
    echo "Applying debug-10-nodes.patch"
    git apply debug-10-nodes.patch
    echo "Applied instances setup patch"
else
    echo "Patch already applied"
fi

# Build the project
npm run prepare

# Check if shardus and @shardus/archiver exist
echo "Checking for shardus and @shardus/archiver..."
if ! command -v shardus &> /dev/null; then
    echo "shardus not found, installing..."
    npm install -g shardus
fi

if ! npm list -g | grep -q "@shardus/archiver"; then
    echo "@shardus/archiver not found, updating..."
    npm update @shardus/archiver
fi

# Start the shardus network
shardus start 10
echo "Started 10 nodes with shardus"

# Wait for 90 seconds
echo "Waiting for 90 seconds before starting the json rpc server"
sleep 90


# Change directory back to json-rpc-server and run the test suite
cd $REPO_NAME
npm run start

# Wait for 90 seconds
echo "Waiting for 90 seconds before running the test suite..."
sleep 90

npm run test
echo "Test suite completed."