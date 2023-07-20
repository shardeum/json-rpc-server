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
  websocket:{
    enabled: boolean
    serveSubscriptions: boolean
  }
  dynamicConsensorNode: boolean
  useConfigNodeIp: boolean
  askLocalHostForArchiver: boolean
  rotationInterval: number
  faucetServerUrl: string
  queryFromValidator: boolean
  queryFromArchiver: boolean
  explorerUrl: string
  queryFromExplorer: boolean
  rpcDataServerUrl: string
  generateTxTimestamp: boolean
  nodelistRefreshInterval: number
  defaultRequestRetry: number
  defaultRequestTimeout: any
  recordTxStatus: boolean
  rateLimit: boolean
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
  nonceValidate: boolean

  /**
   * Consensor(node) do reject transaction with higher nonce than the correct one.
   * This value control whether rpc take knowledge of it and let the client know if the tx is rejected.
   * Disabling this may cause stuck tx inside dapp such as metamask, because rpc server does not let the app know if tx is reject by validator.
   */
  adaptiveRejection: boolean
  filterDeadNodesFromArchiver: boolean
  verbose: boolean

  dashboard: {
    enabled: boolean
    dist_path: string
  }
  isRemoteLocalNetwork: boolean // To indicate that the RPC server is running for a remote local network
  nodeExternalIpForRemoteLocalNetwork: string // The external IP of the node for the remote local network
}

export const CONFIG: Config = {

  websocket:{
    enabled: false,
    serveSubscriptions: false,
  },

  ip: '0.0.0.0',
  port: 8080,
  chainId: 8082,
  nodeIpInfo: {
    externalIp: '127.0.0.1',
    externalPort: 9001,
  },
  dynamicConsensorNode: true,
  useConfigNodeIp: false,
  askLocalHostForArchiver: true,
  rotationInterval: 60,
  faucetServerUrl: 'https://faucet.liberty10.shardeum.org',
  queryFromValidator: true,
  queryFromArchiver: false,
  explorerUrl: 'http://127.0.0.1:6001',
  queryFromExplorer: false,
  rpcDataServerUrl: 'http://127.0.0.1:4445',
  generateTxTimestamp: true,
  nodelistRefreshInterval: 5000,
  defaultRequestRetry: 5,
  defaultRequestTimeout: {
    default: 2000,
    contract: 7000,
    account: 5000,
    full_nodelist: 10000,
  },
  recordTxStatus: false,
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
  statLog: false,
  passphrase: process.env.PASSPHRASE || 'sha4d3um', // this is to protect debug routes
  secret_key: process.env.SECRET_KEY || 'YsDGSMYHkSBMGD6B4EmD?mFTWG2Wka-Z9b!Jc/CLkrM8eLsBe5abBaTSGeq?6g?P', // this is the private key that rpc server will used to sign jwt token
  nonceValidate: false,
  adaptiveRejection: true,
  filterDeadNodesFromArchiver: false,
  verbose: false,
  dashboard: {
    enabled: true,
    // relative path will work but absolute path is recommended
    dist_path: '../rpc-gateway-frontend/build/',
  },
  isRemoteLocalNetwork: false,
  nodeExternalIpForRemoteLocalNetwork: '127.0.0.1',
}
