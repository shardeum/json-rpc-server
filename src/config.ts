import { RequestTimeout, DevSecurityLevel } from './types'

type Config = {
  // set ip to be public exposed address
  // so that rpc could let explorer know about its ip
  // this is required for subscriptions to work
  ip: string
  port: number
  chainId: number
  nodeIpInfo: {
    externalIp: string
    externalPort: number
  }
  websocket: {
    enabled: boolean
    serveSubscriptions: boolean
    maxConnections: number // Maximum number of concurrent WebSocket connections
    maxSubscriptionsPerSocket: number // Maximum number of subscriptions per socket
    connectionTimeoutMs: number // Connection timeout in milliseconds (default 1 day)
    inactivityTimeoutMs: number // 60 seconds inactivity timeout
    inactivityCheckIntervalMs: number // Check every 10 seconds
    maxConnectionsPerIP: number // Maximum number of connections allowed per IP per socket
    cleanupIntervalMs: number // Cleanup interval in milliseconds (default 10 minutes)
  }
  trustProxy: boolean // Whether to trust the X-Forwarded-For header
  log_server: {
    ip: string
    port: number
  }
  dynamicConsensorNode: boolean
  useConfigNodeIp: boolean
  askLocalHostForArchiver: boolean
  rotationInterval: number
  faucetServerUrl: string
  queryFromValidator: boolean
  explorerUrl: string
  queryFromExplorer: boolean
  generateTxTimestamp: boolean
  nodelistRefreshInterval: number
  defaultRequestRetry: number
  defaultRequestTimeout: RequestTimeout
  aalgWarmup: boolean
  aalgWarmupServiceTPS: number
  recordTxStatus: boolean
  rateLimit: boolean
  staticGasEstimate?: string
  gasEstimateMethod: string
  gasEstimateInvalidationIntervalInMs: number
  gasEstimateUseCache: boolean
  rateLimitOption: {
    limitFromAddress: boolean
    limitToAddress: boolean
    banIpAddress: boolean
    banSpammerAddress: boolean
    allowFaucetAccount: boolean
    allowedTxCountInCheckInterval: number
    spammerCheckInterval: number
    releaseFromBlacklistInterval: number
    allowedHeavyRequestPerMin: number
    softReject: boolean
  }
  statLog: boolean

  blockCacheSettings: {
    lastNBlocksSize: number
    lruMBlocksSize: number
  }

  /**
   * Consensor(node) do reject transaction with higher nonce than the correct one.
   * This value control whether rpc take knowledge of it and let the client know if the tx is rejected.
   * Disabling this may cause stuck tx inside dapp such as metamask, because rpc server does not let the app know if tx is reject by validator.
   */
  adaptiveRejection: boolean
  filterDeadNodesFromArchiver: boolean
  verbose: boolean
  enableRequestLogger: boolean
  firstLineLogs: boolean
  verboseRequestWithRetry: boolean
  verboseAALG: boolean

  dashboard: {
    enabled: boolean
    dist_path: string
  }

  isRemoteLocalNetwork: boolean // To indicate that the RPC server is running for a remote local network
  nodeExternalIpForRemoteLocalNetwork: string // The external IP of the node for the remote local network
  /**
   * This is to enable/disable the collector sourcing feature
   * If enabled, the rpc server will try to get data from the local collector api server
   * fallback is active network or explorer
   * **/
  collectorSourcing: {
    enabled: boolean
    collectorApiServerUrl: string
  }
  serviceValidatorSourcing: {
    enabled: boolean
    serviceValidatorUrl: string
  }

  ServicePointsPerSecond: number //service function points per second
  ServicePointsInterval: number
  ServicePoints: {
    ['aalg-warmup']: number
  }

  enableBlockCache: boolean
  useRoundRobinConsensorSelection: boolean
  devPublicKeys: { [pubkey: string]: DevSecurityLevel }
  debugEndpointRateLimiting: {
    window: number // time window
    limit: number // max requests per IP within time window
  }
  axiosTimeoutInMs: number
  enableBlacklistingIP: boolean
  maxEntriesAllowed: number // maximum number of entries allowed for map to store
  foundationNodeFilter: {
    enabled: boolean
    useEndpoint: boolean
    endpointUrl: string
    filePath: string
    minFoundationNodesForInjectFilter: number
  }
}

export type ServicePointTypes = 'aalg-warmup'

export const CONFIG: Config = {
  websocket: {
    enabled: true,
    serveSubscriptions: Boolean(process.env.WS_SAVE_SUBSCRIPTIONS) || false,
    maxConnections: Number(process.env.WS_MAX_CONNECTIONS) || 1000,
    maxSubscriptionsPerSocket: Number(process.env.WS_MAX_SUBSCRIPTIONS_PER_SOCKET) || 50,
    connectionTimeoutMs: Number(process.env.WS_CONNECTION_TIMEOUT_MS) || 24 * 60 * 60 * 1000, // 1 day in ms
    inactivityTimeoutMs: 60000, // 60 seconds inactivity timeout
    inactivityCheckIntervalMs: 10000, // Check every 10 seconds
    maxConnectionsPerIP: Number(process.env.WS_MAX_CONNECTIONS_PER_IP) || 3,
    cleanupIntervalMs: Number(process.env.WS_CLEANUP_INTERVAL_MS) || 600000, // 10 minute in ms
  },
  trustProxy: false,
  log_server: {
    ip: process.env.LOG_SERVER_HOST || '0.0.0.0',
    port: Number(process.env.LOG_SERVER_PORT) || 4446,
  },
  ip: '0.0.0.0',
  port: Number(process.env.RPC_PORT) || 8080,
  chainId: Number(process.env.CHAIN_ID) || 8082,
  nodeIpInfo: {
    externalIp: process.env.NODE_EXTERNAL_IP || '127.0.0.1',
    externalPort: Number(process.env.NODE_EXTERNAL_PORT) || 9001,
  },
  dynamicConsensorNode: true,
  useConfigNodeIp: false,
  askLocalHostForArchiver: true,
  rotationInterval: 60,
  faucetServerUrl: process.env.FAUCET_URL || 'https://faucet.liberty10.shardeum.org',
  queryFromValidator: Boolean(process.env.QUERY_FROM_VALIDATOR) || true,
  explorerUrl: process.env.EXPLORER_URL || 'http://127.0.0.1:6001',
  queryFromExplorer: false,
  generateTxTimestamp: true,
  nodelistRefreshInterval: Number(process.env.NODELIST_REFRESH_INTERVAL) || 30000,
  defaultRequestRetry: 5,
  gasEstimateMethod: process.env.GAS_ESTIMATE_METHOD || 'serviceValidator', //serviceValidator or replayEngine or validator
  gasEstimateInvalidationIntervalInMs: 1000 * 60 * 60 * 2, // 2 hours
  gasEstimateUseCache: false,
  staticGasEstimate: process.env.STATIC_GAS_ESTIMATE || '0x5B8D80', // comment out rather than delete this line
  defaultRequestTimeout: {
    default: 2000,
    contract: 7000,
    account: 10000,
    full_nodelist: 10000,
  },
  aalgWarmup: Boolean(process.env.AALG_WARMUP) || true,
  aalgWarmupServiceTPS: 10,
  recordTxStatus: false, // not safe for production, keep this off. Known issue.
  rateLimit: true,
  rateLimitOption: {
    softReject: true,
    limitFromAddress: true,
    limitToAddress: true,
    banIpAddress: true,
    banSpammerAddress: true,
    allowFaucetAccount: true,
    allowedTxCountInCheckInterval: 10, // allow 1 txs in every 12s = (checkInterval * 60 / allowedTxCountInCheckInterval)
    spammerCheckInterval: 2, // check spammers and ban them every 2 min
    releaseFromBlacklistInterval: 5, // remove banned ip from blacklist after 5 mins
    allowedHeavyRequestPerMin: 20, // number of eth_call + tx inject allowed within 60s
  },
  statLog: false, // not safe for production, keep this off
  adaptiveRejection: true,
  filterDeadNodesFromArchiver: false,
  verbose: false,
  enableRequestLogger: process.env.SHARDEUM_JSONRPC_ENABLE_REQUEST_LOGGING === 'true' || false,
  verboseRequestWithRetry: false,
  verboseAALG: false,
  firstLineLogs: true, // default is true and turn off for prod for perf

  blockCacheSettings: {
    lastNBlocksSize: Number(process.env.LAST_N_BLOCKS_SIZE) || 100,
    lruMBlocksSize: Number(process.env.LRU_M_BLOCKS_SIZE) || 100,
  },

  dashboard: {
    enabled: true,
    // relative path will work but absolute path is recommended
    dist_path: '../rpc-gateway-frontend/build/',
  },
  isRemoteLocalNetwork: false,
  nodeExternalIpForRemoteLocalNetwork: '127.0.0.1',
  collectorSourcing: {
    enabled: false,
    collectorApiServerUrl: 'http://0.0.0.0:6001',
  },
  serviceValidatorSourcing: {
    enabled: false,
    serviceValidatorUrl: 'http://0.0.0.0:9001',
  },

  ServicePointsPerSecond: 200,
  ServicePointsInterval: 2,
  ServicePoints: {
    ['aalg-warmup']: 20,
  },
  enableBlockCache: false,
  useRoundRobinConsensorSelection: true,
  devPublicKeys: {
    // '': DevSecurityLevel.Unauthorized,
    // These are production keys.  Use 'git apply use_test_key.patch' for unsafe local test keys
    // Never merge a commit with changes to these lines without approval.
    // always prefix with prettier ignore
    /* prettier-ignore */ 'cd38e866813e063423adf2b1bb7608eef7f62c306c3b8007db925a6aafb3c0f5': DevSecurityLevel.High,
    /* prettier-ignore */ '1bc657b085acb240d8315857a1a1c532571e47d409c1bddd8d071b2af530c2be': DevSecurityLevel.High,
    /* prettier-ignore */ '79fadced0d463a88d837485228004a0671c9baa2ff24ec6251b569a5bc0abc3e': DevSecurityLevel.High,
    /* prettier-ignore */ 'e7849fa46ebe9e2091599d12e5c11c8fcf9051633065348b05ab7adf0962f192': DevSecurityLevel.High,
    /* prettier-ignore */ '3cbc079e9b44ba215256444433314262a8e1d342d37b4e8c0c9ab27e78dad167': DevSecurityLevel.High,
    /* prettier-ignore */ '23526214a0325ef9a3fd53b7067c7a138d7bc3c6e78b907a15af793f971028ec': DevSecurityLevel.High,
    /* prettier-ignore */ 'fe60d9a1d0ead0132a0dceb82bd6faf9b1b509a08769e83e500a12ae0ae8d1d5': DevSecurityLevel.High,
    /* prettier-ignore */ '230b6172aba54d592171bd3f2a599f5688b1447fb636eedbc39298ab7d9c05c2': DevSecurityLevel.High,
    /* prettier-ignore */ '971ebbe78cce7bfa0ada5a7a0810c53ff72287e91b2f43bea3703409005590cf': DevSecurityLevel.High,
    /* prettier-ignore */ '4ce16834c272a5db61ca34a93d1dfa86ae9355fabef9f1af7b6e0d8e4a5aa0ab': DevSecurityLevel.High,
    /* prettier-ignore */ '02c8a6d5360bdb886dbd9dfa0ec73e23c32be98fb9745a0ba9d63b54af04859d': DevSecurityLevel.High,
    /* prettier-ignore */ '343fcbcc4191b312120e45d2f190d44ca8696f2777dfcc8b6c2ac6756abc2671': DevSecurityLevel.High,
    /* prettier-ignore */ '13e2c5b6990b92d769239bc289a57246d4c000bf1f2c3f426c24b8eaac78f21c': DevSecurityLevel.High,
    /* prettier-ignore */ '8999bd238993c42921528b333774c54410d2d48606e54e58d798241f6942aabf': DevSecurityLevel.High,
    /* prettier-ignore */ 'd5b9be544b7f6d119ea52ce7f82870d4249ad663f0a75e68096df44c7843a9f8': DevSecurityLevel.High,
    /* prettier-ignore */ '1337e51d288a6ae240c5e91ecffba812d6baff3d643de559604a8f13d63f03d9': DevSecurityLevel.High,
    /* prettier-ignore */ '5988415bc8675f94e0059099ddf1c414ca737562f33e6f1091e8fee307d3352c': DevSecurityLevel.High,
    /* prettier-ignore */ '000aa90686097de101bb5fad9cc4af6ccf568b4612d8dd032497a8ac9ccba91f': DevSecurityLevel.High,
    /* prettier-ignore */ '4347a51c55921f7ffdf00ebc84d0849598a59fc9eb244bcbf5a4e26abad0a005': DevSecurityLevel.High,
    /* prettier-ignore */ '3dfb1794a88ad3c19b63b9ef2006d45f7c01acedd7795908457f1470f8d10d2f': DevSecurityLevel.High,
    /* prettier-ignore */ 'b17be71f65ec9804404de1333a93132b83a1d614a3d14a78db5c7e3219e49524': DevSecurityLevel.High,
    /* prettier-ignore */ '26c333f353c06766cf811ba97572409848c90fb66291d8ef91e25c4d1bf439c7': DevSecurityLevel.High,
    /* prettier-ignore */ 'abb118e65bbd834d3f9c3135f72a3ed883b5c3b85c9e4a647b142f2824663e20': DevSecurityLevel.High,
    /* prettier-ignore */ '154cca8f6394fe43a08b579a4fd5fc666cf69b2b1f54364790f35bf4d612cf66': DevSecurityLevel.High,
    /* prettier-ignore */ 'ee2e6e301f1e4474317f6e3d1e9c9e8d6abccd9a263654e639303e4aadc9ff32': DevSecurityLevel.High,
    /* prettier-ignore */ 'e55a70ae4ea0a1ef4760d40df72a78016fddbaa70e479d032ddbb6f77a07ddc8': DevSecurityLevel.High,
  },
  debugEndpointRateLimiting: {
    window: 15 * 60 * 1000, // 15 minutes
    limit: 100, // 100 requests per IP
  },
  axiosTimeoutInMs: 3000,
  enableBlacklistingIP: false,
  maxEntriesAllowed: 10000,
  foundationNodeFilter: {
    enabled: false,
    useEndpoint: false,
    endpointUrl: '', // not used if useEndpoint is false
    filePath: './foundation-nodes.json',
    minFoundationNodesForInjectFilter: 50,
  },
}
