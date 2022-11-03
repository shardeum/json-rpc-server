
type Config = {
  port: number,
  chainId: number,
  nodeIpInfo: {
    externalIp:"" ,
    externalPort: number
  },
  dynamicConsensorNode: boolean,
  useConfigNodeIp : boolean,
  askLocalHostForArchiver: boolean,
  rotationInterval: number,
  archiverIpInfo: {
    externalIp: string,
    externalPort:number
  },
  faucetServerUrl: string
  queryFromArchiver: boolean,
  explorerInfo: {
    ip: string,
    port:number 
  },
  queryFromExplorer: boolean,
  explorerRPCDataServerInfo: {
    externalIp: string,
    externalPort:number
  },
  generateTxTimestamp: boolean,
  recordTxStatus: boolean,
  rateLimit: boolean,
  rateLimitOption: {
    limitFromAddress: boolean,
    limitToAddress: boolean,
    banIpAddress: boolean,
    banSpammerAddress: boolean,
    allowFaucetAccount: boolean,
    allowedTxCountInCheckInterval: number
    spammerCheckInterval: number
    releaseFromBlacklistInterval: number
    allowedHeavyRequestPerMin: number
    softReject: boolean
  },
  statLog: boolean,
  passphrase: string,
  secret_key: string,
  nonceValidate: boolean,
  verbose : boolean
}

const CONFIG: Config = {
  port: 8080,
  chainId: 8080,
  nodeIpInfo: {
    externalIp:"" ,
    externalPort: 9001
  },
  dynamicConsensorNode: true,
  useConfigNodeIp : false,
  askLocalHostForArchiver: true,
  rotationInterval: 60,
  archiverIpInfo: {
    externalIp: "localhost",
    externalPort: 4000
  },
  faucetServerUrl: "https://faucet.liberty10.shardeum.org",
  queryFromArchiver: false,
  explorerInfo: {
    ip: "localhost",
    port: 6001
  },
  queryFromExplorer: true,
  explorerRPCDataServerInfo: {
    externalIp: "localhost",
    externalPort: 4445
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
    allowedHeavyRequestPerMin: 20 // number of eth_call + tx inject allowed within 60s
  },
  statLog: true,
  passphrase: process.env.PASSPHRASE || 'sha4d3um', // this is to protect debug routes
  secret_key: process.env.SECRET_KEY || 'YsDGSMYHkSBMGD6B4EmD?mFTWG2Wka-Z9b!Jc/CLkrM8eLsBe5abBaTSGeq?6g?P',  // this is the private key that rpc server will used to sign jwt token
  nonceValidate: false,
  verbose : false
}

module.exports = CONFIG
