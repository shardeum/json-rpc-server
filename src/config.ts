type Config = {
  port: number
  chainId: number
  nodeIpInfo: {
    externalIp: string
    externalPort: number
  }
  dynamicConsensorNode: boolean
  useConfigNodeIp: boolean
  askLocalHostForArchiver: boolean
  rotationInterval: number
  archiverIpInfo: {
    externalIp: string
    externalPort: number
  }
  existingArchivers: {
    ip: string
    port: number
    publicKey: string
  }[]
  faucetServerUrl: string
  queryFromValidator: boolean
  queryFromArchiver: boolean
  explorerUrl: string
  queryFromExplorer: boolean
  rpcDataServerUrl: string
  generateTxTimestamp: boolean
  nodelistRefreshInterval: number
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
    enabled: boolean,
    dist_path: string,
  }
}

export const CONFIG: Config = {
  port: 8080,
  chainId: 8082,
  nodeIpInfo: {
    externalIp: 'localhost',
    externalPort: 9001,
  },
  dynamicConsensorNode: true,
  useConfigNodeIp: false,
  askLocalHostForArchiver: true,
  rotationInterval: 60,
  archiverIpInfo: {
    externalIp: 'localhost',
    externalPort: 4000,
  },
  existingArchivers: [
    {
      ip: '3.127.57.166',
      port: 4000,
      publicKey: '758b1c119412298802cd28dbfa394cdfeecc4074492d60844cc192d632d84de3',
    },
    {
      ip: '45.79.113.106',
      port: 4000,
      publicKey: '7af699dd711074eb96a8d1103e32b589e511613ebb0c6a789a9e8791b2b05f34',
    },
    {
      ip: '139.144.189.238',
      port: 4000,
      publicKey: '840e7b59a95d3c5f5044f4bc62ab9fa94bc107d391001141410983502e3cde63',
    },
    {
      ip: '194.195.220.150',
      port: 4000,
      publicKey: '616f720f4b6145373acd95b068cb674ff3a24ba738cfff5da568ec36873859f6',
    },
  ],
  faucetServerUrl: 'https://faucet.liberty10.shardeum.org',
  queryFromValidator: true,
  queryFromArchiver: false,
  explorerUrl: 'http://localhost:6001',
  queryFromExplorer: false,
  rpcDataServerUrl: 'http://localhost:4445',
  generateTxTimestamp: true,
  nodelistRefreshInterval: 5000,
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
  verbose: true,
  dashboard: {
    enabled: true,

    // relative path will work but absolute path is recommended
    dist_path: '../rpc-gateway-frontend/build/',
  }
}
