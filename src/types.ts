export enum FilterTypes {
  log,
  block,
  pendingTransaction,
}

export enum AccountType {
  Account, //  EOA or CA
  ContractStorage, // Contract storage key value pair
  ContractCode, // Contract code bytes
  Receipt, //This holds logs for a TX
  Debug,
  NetworkAccount,
  NodeAccount,
  NodeRewardReceipt,
  DevAccount,
  NodeAccount2,
  StakeReceipt,
  UnstakeReceipt,
  InternalTxReceipt,
}

export enum TransactionType {
  Receipt = 0, // EVM Receipt
  NodeRewardReceipt = 1,
  StakeReceipt = 2,
  UnstakeReceipt = 3,
  EVM_Internal = 4,
  ERC_20 = 5,
  ERC_721 = 6,
  ERC_1155 = 7,
  InternalTxReceipt = 8,
}

export type IpData = { ip: string; count: number }

export type FromData = {
  count: number
  from: string
  ips: Record<string, IpData>
}

export type ToData = {
  to: string
  count: number
  from: Record<string, FromData>
}

export type Filter = {
  fromBlock?: string
  toBlock?: string
  address?: string | string[]
  topics?: string[]
  blockHash?: string
}

export type Topic = string | string[]
export type BaseFilterArgs = { id: string }
export type LogFilter = BaseFilterArgs & {
  address: string
  topics: Topic[]
  fromBlock?: string
  toBlock?: string
  lastQueriedTimestamp: number
  lastQueriedBlock: number
  createdBlock: number
}
export type BlockFilter = BaseFilterArgs & {
  lastQueriedTimestamp: number
  lastQueriedBlock: number
  createdBlock: number
}
export type InternalFilter = {
  type: FilterTypes
  updates: string[]
  unsubscribe: () => void
  filter: LogFilter | BlockFilter | PendingTransactionFilter
}

export interface LogQueryRequest {
  address?: string
  topics?: Topic[]
  fromBlock?: string
  toBlock?: string
}

export type PendingTransactionFilter = BaseFilterArgs & {
  lastQueriedTimestamp: number
  lastQueriedBlock: number
  createdBlock: number
}

export interface NodeJSError extends Error {
  errno?: number
  code?: string
  path?: string
  syscall?: string
}

export type Node = {
  id: string
  ip: string
  port: number
  publicKey: string
}

type ReadableReceipt = {
  blockHash: string
  blockNumber: string
  contractAddress: null | string
  cumulativeGasUsed: string
  data: string
  from: string
  gasRefund: string
  gasUsed: string
  logs: Log[]
  logsBloom: string
  nonce: string
  status: number
  to: string
  transactionHash: string
  transactionIndex: string
  value: string
  reason?: string
}

type Log = {
  address: string
  blockHash: string
  blockNumber: string
  data: string
  logIndex: string
  topics: string[]
  transactionHash: string
  transactionIndex: string
}

export type OriginalTxData = {
  raw: string
  timestamp?: number
}

type TransactionResult = {
  txIdShort: string
  txResult: string
}

type Signature = {
  owner: string
  sig: string
}

interface BaseWrappedEVMAccount {
  accountType: AccountType
  /** account address in EVM space. can have different meanings depending on account type */
  ethAddress: string

  /** account hash */
  hash: string

  /** account timestamp. last time a TX changed it */
  timestamp: number
}

export type WrappedEVMAccount = BaseWrappedEVMAccount & (WrappedDataReceipt | WrappedDataContractStorage)

export type WrappedDataContractStorage = {
  accountType: AccountType.ContractStorage

  /** EVM CA storage key */
  key: string

  /** EVM buffer value if this is of type CA_KVP */
  value: {
    data: Array<number>
    type: string
  }
}

export type WrappedDataReceipt = {
  accountType:
    | AccountType.Receipt
    | AccountType.NodeRewardReceipt
    | AccountType.StakeReceipt
    | AccountType.UnstakeReceipt
    | AccountType.InternalTxReceipt

  /** For debug tx */
  balance: string
  amountSpent: string
  contractInfo: ERC20ContractDetail
  nonce: string
  readableReceipt: ReadableReceipt
  receipt: TxReceipt
  tokenTx: TokenTx
  txFrom: string
  txId: string
}

/** Unrelated to `WrappedEVMAccount`,  */
export interface WrappedAccount {
  accountId: string
  stateId: string
  data: WrappedDataReceipt & WrappedEVMAccount
  timestamp: number
  accountCreated?: boolean
}

interface ERC20ContractDetail {
  name: string
  decimals: string
  symbol: string
  totalSupply: string
  txHash: string
}

export type TxReceipt = PreByzantiumTxReceipt | PostByzantiumTxReceipt

export interface BaseTxReceipt {
  // Cumulative gas used in the block including this tx
  cumulativeBlockGasUsed: bigint
  // Bloom bitvector
  bitvector: Buffer
  // Logs emitted
  logs: Log[]
}

// Pre-Byzantium receipt type with a field for the intermediary state root
export interface PreByzantiumTxReceipt extends BaseTxReceipt {
  // Intermediary state root
  stateRoot: Buffer
}

/**
 * Receipt type for Byzantium and beyond replacing the intermediary
 * state root field with a status code field (EIP-658)
 */
export interface PostByzantiumTxReceipt extends BaseTxReceipt {
  // Status of transaction, `1` if successful, `0` if an exception occured
  status: 0 | 1
}

export interface TokenTx<C = object> {
  cycle: number
  timestamp: number
  contractAddress: string
  contractInfo?: C
  tokenFrom: string
  tokenTo: string
  tokenValue: string
  tokenType: TransactionType
  tokenEvent: string
  tokenOperator?: string | null
  transactionFee: string

  // references another tx
  txId?: string
  txHash: string
}

export type TransactionFromArchiver = {
  accountId: string
  cycleNumber: number
  data: WrappedEVMAccount
  originalTxData: OriginalTxData
  result: TransactionResult
  sign: Signature
  timestamp: number
  txId: string
}

export type TransactionFromExplorer = {
  txId: string
  result: TransactionResult
  cycle: number
  partition: null | string
  timestamp: number
  blockNumber: number
  blockHash: string
  wrappedEVMAccount: WrappedEVMAccount
  accountId: string
  txFrom: string
  txTo: string
  nominee: null | string
  txHash: string
  transactionType: number
  originalTxData: OriginalTxData
}

export type ReceiptFromExplorer = {
  receiptId: string
  tx: {
    originalTxData: OriginalTxData
    timestamp: number
    txId: string
  }
  cycle: number
  timestamp: number
  result: TransactionResult
  beforeStateAccounts: WrappedAccount[]
  accounts: WrappedAccount[]
  receipt: WrappedAccount
  sign: Signature
}

export type AccountTypes = EOA_CA_Account | ContractStorageAccount | ContractCodeAccount
export type AccountTypesData = EOA_CA_AccountData | ContractStorageAccountData | ContractCodeAccountData

export type EOA_CA_Account = {
  accountId: string
  data: EOA_CA_AccountData
}

type ContractStorageAccount = {
  accountId: string
  data: ContractStorageAccountData
}

type ContractCodeAccount = {
  accountId: string
  data: ContractCodeAccountData
}

type EOA_CA_AccountData = {
  timestamp: number
  account: {
    nonce: string
    balance: string
    stateRoot: {
      type: string
      data: Array<number>
    }
    codeHash: {
      type: string
      data: Array<number>
    }
  }
  ethAddress: string
  accountType: number
  hash: string
}

type ContractCodeAccountData = {
  accountType: number
  ethAddress: string
  hash: string
  timestamp: number
  codeHash: {
    data: Array<number>
    type: string
  }
  codeByte: {
    data: Array<number>
    type: string
  }
}

type ContractStorageAccountData = {
  accountType: number
  ethAddress: string
  hash: string
  timestamp: number
  value: object
}

export type Account2 = {
  nonce: string
  balance: string
  storageRoot: string
  codeHash: string
  operatorAccountInfo: unknown
}

export type RequestTimeout = {
  default: number
  contract: number
  account: number
  full_nodelist: number
}
