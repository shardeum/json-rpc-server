# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
The Shardeum JSON-RPC Server provides an EVM-compatible API interface for interacting with the Shardeum blockchain. It bridges dapps with the blockchain through HTTP/WebSocket endpoints.

## Development Commands

### Building and Running
```bash
# Development
npm install
npm run dev  # Runs with nodemon for auto-reload

# Production
npm run compile
npm run start

# Docker (recommended for production)
docker compose up -d
```

### Testing
```bash
# Run all tests
npm test

# Run a single test file
npm test -- test/unit/path/to/test.test.ts
```

### Code Quality
```bash
# Linting
npm run lint

# Formatting
npm run format-check  # Check formatting
npm run format-fix    # Auto-fix formatting
```

## Architecture Overview

### Core Components
1. **Server Entry** (`src/server.ts`): Express server with Jayson JSON-RPC handling and WebSocket support
2. **API Implementation** (`src/api.ts`): EVM-compatible JSON-RPC methods implementation
3. **External Services Integration**:
   - Archiver: Historical blockchain data (configured via `archiverUrl`)
   - Collector: Data aggregation service
   - Service Validator: Transaction validation

### Key Architectural Patterns
- **Middleware Pipeline**: IP injection → Rate limiting → Method whitelist → Request logging → Authentication
- **Round-Robin Node Selection**: Distributes load across consensus nodes
- **Caching Strategy**: Block caching with configurable size limits
- **Security Layers**: Rate limiting per IP/address, spammer detection, debug endpoint protection

### Configuration
Main configuration in `src/config.ts` with environment variable overrides:
- `RPC_PORT`: Server port (default: 8080)
- `ARCHIVER_IP`/`ARCHIVER_PORT`: Archiver connection
- `LOG_SAVE_TO_DATABASE`: Enable request logging
- `RATE_LIMIT`: Enable rate limiting
- `SPAM_DETECTION`: Enable spammer detection

### WebSocket Implementation
- Located in `src/websocket/`
- Supports `eth_subscribe` for newHeads and logs
- Connection limits: 1000 total, 50 subscriptions per socket
- Automatic cleanup on disconnect

### Security Considerations
- All SQL queries use parameterized statements
- Rate limiting: 10 transactions per 2 minutes per address
- IP blacklisting support via `blacklist.json`
- Developer authentication via public keys in `devPublicKeys.json`

### Testing Strategy
- Jest with TypeScript (config in `jest.config.js`)
- Unit tests in `test/unit/`
- High timeout (5s) for integration-style tests
- Coverage reporting enabled by default

### Gas Estimation
Three available methods (configurable via `gasEstimationMethod`):
1. `serviceValidator`: Uses external validator service
2. `replayEngine`: Replays transaction for accurate estimation
3. `validator`: Direct validator node query

### Database
- SQLite for local storage
- Schema initialization in `src/storage/`
- Request logging table for analytics

### Deployment Notes
- PM2 support for process management
- Docker deployment uses host network mode
- Configurable replica count for scaling
- Health check endpoint at `/health`