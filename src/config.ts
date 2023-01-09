type Config = {
  port: number
  chainId: number
  nodeIpInfo: {
    externalIp:string ,
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
  faucetServerUrl: string
  queryFromValidator: boolean
  queryFromArchiver: boolean
  explorerUrl: string
  queryFromExplorer: boolean
  explorerRPCDataServerInfo: {
    externalIp: string
    externalPort: number
  }
  generateTxTimestamp: boolean
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
  verbose: boolean
}

export const CONFIG: Config = {
  port: 8080,
  chainId: 8081,
  nodeIpInfo: {
    externalIp: '',
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
  faucetServerUrl: 'https://faucet.liberty10.shardeum.org',
  queryFromValidator: true,
  queryFromArchiver: true,
  explorerUrl: 'http://localhost:6001',
  queryFromExplorer: false,
  explorerRPCDataServerInfo: {
    externalIp: 'localhost',
    externalPort: 4445,
  },
  generateTxTimestamp: true,
  recordTxStatus: true,
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
  statLog: true,
  passphrase: process.env.PASSPHRASE || 'sha4d3um', // this is to protect debug routes
  secret_key: process.env.SECRET_KEY || 'YsDGSMYHkSBMGD6B4EmD?mFTWG2Wka-Z9b!Jc/CLkrM8eLsBe5abBaTSGeq?6g?P', // this is the private key that rpc server will used to sign jwt token
  nonceValidate: false,
  adaptiveRejection: true,
  verbose: true,
}
