import { RequestTimeout } from './types'

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
  }
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
  passphrase: string
  secret_key: string

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
}

export type ServicePointTypes = 'aalg-warmup'

export const CONFIG: Config = {
  websocket: {
    enabled: true,
    serveSubscriptions: Boolean(process.env.WS_SAVE_SUBSCRIPTIONS) || false,
  },
  log_server: {
    ip: process.env.LOG_SERVER_HOST || '0.0.0.0',
    port: Number(process.env.LOG_SERVER_PORT) || 4446,
  },
  ip: '0.0.0.0',
  port: 8080,
  chainId: 8082,
  nodeIpInfo: {
    externalIp: process.env.NODE_EXTERNAL_IP || '127.0.0.1',
    externalPort: Number(process.env.NODE_EXTERNAL_PORT) || 9001,
  },
  dynamicConsensorNode: true,
  useConfigNodeIp: false,
  askLocalHostForArchiver: true,
  rotationInterval: 60,
  faucetServerUrl: process.env.FAUCET_URL || 'https://faucet.liberty10.shardeum.org',
  queryFromValidator: true,
  explorerUrl: process.env.EXPLORER_URL || 'http://127.0.0.1:6001',
  queryFromExplorer: false,
  generateTxTimestamp: true,
  nodelistRefreshInterval: 30000,
  defaultRequestRetry: 5,
  gasEstimateMethod: 'serviceValidator', //serviceValidator or replayEngine or validator
  gasEstimateInvalidationIntervalInMs: 1000 * 60 * 60 * 2, // 2 hours
  gasEstimateUseCache: false,
  staticGasEstimate: '0x5B8D80', // comment out rather than delete this line
  defaultRequestTimeout: {
    default: 2000,
    contract: 7000,
    account: 10000,
    full_nodelist: 10000,
  },
  aalgWarmup: false,
  aalgWarmupServiceTPS: 10,
  recordTxStatus: false, // not safe for production, keep this off. Known issue.
  rateLimit: false,
  rateLimitOption: {
    softReject: true,
    limitFromAddress: true,
    limitToAddress: true,
    banIpAddress: false,
    banSpammerAddress: true,
    allowFaucetAccount: true,
    allowedTxCountInCheckInterval: 10, // allow 1 txs in every 12s = (checkInterval * 60 / allowedTxCountInCheckInterval)
    spammerCheckInterval: 2, // check spammers and ban them every 2 min
    releaseFromBlacklistInterval: 12, // remove banned ip from blacklist after 12 hours
    allowedHeavyRequestPerMin: 20, // number of eth_call + tx inject allowed within 60s
  },
  statLog: false, // not safe for production, keep this off
  passphrase: process.env.PASSPHRASE || 'sha4d3um', // this is to protect debug routes
  secret_key: process.env.SECRET_KEY || 'YsDGSMYHkSBMGD6B4EmD?mFTWG2Wka-Z9b!Jc/CLkrM8eLsBe5abBaTSGeq?6g?P', // this is the private key that rpc server will used to sign jwt token
  adaptiveRejection: true,
  filterDeadNodesFromArchiver: false,
  verbose: false,
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
}
