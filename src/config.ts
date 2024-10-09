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
  devPublicKeys: { [pubkey: string]: DevSecurityLevel },
  debugEndpointRateLimiting: {
    window: number // time window
    limit: number // max requests per IP within time window
  }
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
  adaptiveRejection: true,
  filterDeadNodesFromArchiver: false,
  verbose: false,
  enableRequestLogger: true,
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
    /* prettier-ignore */ '26d8bc01edc8cbc11175551174f5b75962e205aa815cdeb4a2d9bdd40c444913': DevSecurityLevel.High,
    /* prettier-ignore */ '285f2e1519e2de572d3564dc08eed4dffc9c6497879d7609fbb8c28e75915ec3': DevSecurityLevel.High,
    /* prettier-ignore */ 'cd38e866813e063423adf2b1bb7608eef7f62c306c3b8007db925a6aafb3c0f5': DevSecurityLevel.High,
    /* prettier-ignore */ '1bc657b085acb240d8315857a1a1c532571e47d409c1bddd8d071b2af530c2be': DevSecurityLevel.High,
    /* prettier-ignore */ 'ca73927b33a4825b9728835b49cb69332781a8c047bda2b1efae8211128b61ca': DevSecurityLevel.High,
    /* prettier-ignore */ '57a7620a01280a852eede05b6f2adc013f5bce84aa06a850ca44195408224651': DevSecurityLevel.High,
    /* prettier-ignore */ '79fadced0d463a88d837485228004a0671c9baa2ff24ec6251b569a5bc0abc3e': DevSecurityLevel.High,
    /* prettier-ignore */ '3cf4dbef2221dc855921886ab60b6d44fccbb3a6a767eac4919e2c84d43e1c28': DevSecurityLevel.High,
    /* prettier-ignore */ 'bcd13fb740697aa8699541f3093fc2f3dcb6a47987a55093cc6b761cb1ac6d24': DevSecurityLevel.High,
    /* prettier-ignore */ '899de21e0c47a29be4319376a9207f5e63d8e5b7d296b8a6391e301e1f14cd32': DevSecurityLevel.High,
    /* prettier-ignore */ 'e7849fa46ebe9e2091599d12e5c11c8fcf9051633065348b05ab7adf0962f192': DevSecurityLevel.High,
    /* prettier-ignore */ '3b974180cbbf1d680a6ef5a6a21b3eb62ae45b15bf5debb9d9f8b6edf0dd5da6': DevSecurityLevel.High,
    /* prettier-ignore */ '3ebc314b424318654a82aba47e1e54b2f694c80aec02d0b80d61541ac1a0a18f': DevSecurityLevel.High,
    /* prettier-ignore */ '3cbc079e9b44ba215256444433314262a8e1d342d37b4e8c0c9ab27e78dad167': DevSecurityLevel.High,
    /* prettier-ignore */ 'c67d71b986db4abbe2ff50b7b55a4985067fee6db31b9ce072f9c48d5d8e167a': DevSecurityLevel.High,
    /* prettier-ignore */ '23526214a0325ef9a3fd53b7067c7a138d7bc3c6e78b907a15af793f971028ec': DevSecurityLevel.High,
    /* prettier-ignore */ 'fe60d9a1d0ead0132a0dceb82bd6faf9b1b509a08769e83e500a12ae0ae8d1d5': DevSecurityLevel.High,
    /* prettier-ignore */ '230b6172aba54d592171bd3f2a599f5688b1447fb636eedbc39298ab7d9c05c2': DevSecurityLevel.High,
    /* prettier-ignore */ '971ebbe78cce7bfa0ada5a7a0810c53ff72287e91b2f43bea3703409005590cf': DevSecurityLevel.High,
    /* prettier-ignore */ 'a6df8bd6b6c15d13e66b578ed96c9cfe01732f7023fb5323b6efd7521d8cb37a': DevSecurityLevel.High,
    /* prettier-ignore */ '4ce16834c272a5db61ca34a93d1dfa86ae9355fabef9f1af7b6e0d8e4a5aa0ab': DevSecurityLevel.High,
    /* prettier-ignore */ '02c8a6d5360bdb886dbd9dfa0ec73e23c32be98fb9745a0ba9d63b54af04859d': DevSecurityLevel.High,
    /* prettier-ignore */ '343fcbcc4191b312120e45d2f190d44ca8696f2777dfcc8b6c2ac6756abc2671': DevSecurityLevel.High,
    /* prettier-ignore */ 'caf005faf809f70533356218539c9041f2f8ac8a3e0c86507727fda035b5b5bf': DevSecurityLevel.High,
    /* prettier-ignore */ '6e6b40d970ba0bb670dd3c08d704e17a787910fb81837825f7610fd75d9e0319': DevSecurityLevel.High,
    /* prettier-ignore */ '6aa15fe2f8c5c2f804b3172c82926698df368db220f06645f6a1f3efb9e4f7d5': DevSecurityLevel.High,
    /* prettier-ignore */ '2b312b5e9fd22166d20fb240c06464794b64de84b9ce1466be204969e1519253': DevSecurityLevel.High,
    /* prettier-ignore */ '0f59c19627be88beecb687df73bfb9b06d4b19f47ba6f77918be5f3300a2cfb0': DevSecurityLevel.High,
    /* prettier-ignore */ 'ddde232185fcaddc25d91b500b0f8eb3938474cd4d997bc9c97fab1c4221d9f1': DevSecurityLevel.High,
    /* prettier-ignore */ '1a5f522537379e2d84de7b1a4974c529436a31eefa94298b2bd5b5d764d78a46': DevSecurityLevel.High,
    /* prettier-ignore */ '13e2c5b6990b92d769239bc289a57246d4c000bf1f2c3f426c24b8eaac78f21c': DevSecurityLevel.High,
    /* prettier-ignore */ '8999bd238993c42921528b333774c54410d2d48606e54e58d798241f6942aabf': DevSecurityLevel.High,
    /* prettier-ignore */ 'd5b9be544b7f6d119ea52ce7f82870d4249ad663f0a75e68096df44c7843a9f8': DevSecurityLevel.High,
    /* prettier-ignore */ 'ed186e28d0d9fa81d7cd8ca7f304e9291e2a7350823e0783454e29abae5aecd2': DevSecurityLevel.High,
    /* prettier-ignore */ '1337e51d288a6ae240c5e91ecffba812d6baff3d643de559604a8f13d63f03d9': DevSecurityLevel.High,
    /* prettier-ignore */ '5988415bc8675f94e0059099ddf1c414ca737562f33e6f1091e8fee307d3352c': DevSecurityLevel.High,
    /* prettier-ignore */ '3daff5f118da18f7133fc8b8f74da7fa4c73b3569f9d4cc8ac48a73aeb886b3a': DevSecurityLevel.High,
    /* prettier-ignore */ 'b2865c37fc9234921b10fe8e27cd782807adb09e1490489765ed7f18a4c2fa13': DevSecurityLevel.High,
  },
  debugEndpointRateLimiting: {
    window: 15 * 60 * 1000, // 15 minutes
    limit: 100 // 100 requests per IP
  }
}
