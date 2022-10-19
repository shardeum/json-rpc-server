import axios from "axios";
import {bufferToHex, BN} from "ethereumjs-util";
import {
    getAccount,
    getTransactionObj,
    intStringToHex,
    sleep,
    getBaseUrl,
    getArchiverUrl,
    requestWithRetry,
    waitRandomSecond,
    TxStatusCode,
} from './utils'
import crypto from 'crypto'
import { logEventEmitter } from "./logger";
import { isConstructorDeclaration } from "typescript";
const config = require("./config")

export let verbose = config.verbose

let lastQueryTimestamp: number = 0
let lastCycleCounter: string = '0x0'
let lastCycleInfo = {
    blockNumber: lastCycleCounter,
    timestamp: '0x0'
}

//const errorHexStatus: string = '0x' //0x0 if you want an error! (handy for testing..)
const errorCode: number = 500 //server internal error
const errorBusy = {code: errorCode, message: 'Busy or error'};
export let txStatuses: TxStatus[] = []
let maxTxCountToStore = 1000
let lastTxNonce: any
let txMemPool: any = {}
let nonceTracker: any = {}

type InjectResponse = {
    success: boolean,
    reason: string
}

export type TxStatus = {
  txHash: string,
  raw: string,
  injected: boolean,
  accepted: boolean,
  reason: string,
  timestamp: number // if timestamp is not provided in the tx, maybe Date.now()
  ip?: string,
}
export type DetailedTxStatus = {
    ip?: string,
  txHash: string,
  type: string,
  to: string,
  from: string,
  injected: boolean,
  accepted: TxStatusCode.BAD_TX | TxStatusCode.SUCCESS | TxStatusCode.BUSY | TxStatusCode.OTHER_FAILURE,
  reason: string,
  timestamp: string,
}

async function getCurrentBlockInfo() {
    if (verbose) console.log('Running getCurrentBlockInfo')
    let result = {...lastCycleInfo}

    try {
        if (verbose) console.log('Querying getCurrentBlockInfo from validator')
        let res = await requestWithRetry('get', `/eth_blockNumber`)
        let blockNumber = res.data.blockNumber
        let timestamp = Date.now()
        result = {blockNumber: blockNumber, timestamp: intStringToHex(String(timestamp))}
        lastCycleInfo = result
        return result
    } catch (e) {
        console.log('Unable to get cycle number', e)
    }
    return result
}

async function getCurrentBlock() {
    let blockNumber = '0'
    let timestamp = '0x55ba467c'
    try {
        let result = await getCurrentBlockInfo()
        blockNumber = result.blockNumber
        timestamp = result.timestamp
    } catch (e) {
        console.log('Error getCurrentBlockInfo', e)
    }
    if (verbose) console.log('Running getcurrentBlock', blockNumber, timestamp)
    return {
        "difficulty": "0x4ea3f27bc",
        "extraData": "0x476574682f4c5649562f76312e302e302f6c696e75782f676f312e342e32",
        "gasLimit": "0x4a817c800", // 20000000000   "0x1388",
        "gasUsed": "0x0",
        "hash": "0xdc0818cf78f21a8e70579cb46a43643f78291264dda342ae31049421c82d21ae",
        "logsBloom": "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        "miner": "0xbb7b8287f3f0a933474a79eae42cbca977791171",
        "mixHash": "0x4fffe9ae21f1c9e15207b1f472d5bbdd68c9595d461666602f2be20daf5e7843",
        "nonce": "0x689056015818adbe",
        "number": blockNumber,
        "parentHash": "0xe99e022112df268087ea7eafaf4790497fd21dbeeb6bd7a1721df161a6657a54",
        "receiptsRoot": "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
        "sha3Uncles": "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347",
        "size": "0x220",
        "stateRoot": "0xddc8b0234c2e0cad087c8b389aa7ef01f7d79b2570bccb77ce48648aa61c904d",
        "timestamp": timestamp,
        "totalDifficulty": "0x78ed983323d",
        "transactions": [],
        "transactionsRoot": "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
        "uncles": []
    }
}


export function recordTxStatus(txStatus: TxStatus) {
    txStatuses.push(txStatus)
    if ((txStatuses.length > maxTxCountToStore) && config.recordTxStatus) {
        logEventEmitter.emit('tx_insert_db',txStatuses)
        forwardTxStatusToExplorer()
        txStatuses = []
    }
}

function injectAndRecordTx(txHash: string, tx: any, args: any) {
    let {raw} = tx
    axios.post(`${getBaseUrl()}/inject`, tx).then((response ) => {
        if (!config.recordTxStatus) return
        let injectResult: InjectResponse = response.data
        if (injectResult) {
            recordTxStatus({
                txHash,
                raw,
                injected: true,
                accepted: injectResult.success,
                reason: injectResult.reason || '',
                timestamp: tx.timestamp || Date.now(),
                ip: args[1000], // this index slot is reserved for ip, check injectIP middleware
            })
        } else {
            recordTxStatus({
                txHash,
                raw,
                injected: false,
                accepted: false,
                reason: 'Unable to inject transaction into the network',
                timestamp: tx.timestamp || Date.now(),
                ip: args[1000] // this index slot is reserved for ip, check injectIP middleware
            })
        }
    }).catch(e => {
        if (config.recordTxStatus) recordTxStatus({
            txHash,
            raw,
            injected: false,
            accepted: false,
            reason: 'Unable to inject transaction into the network',
            timestamp: tx.timestamp || Date.now(),
            ip: args[1000] // this index slot is reserved for ip, check injectIP middleware l
        })
    })
}

export async function forwardTxStatusToExplorer() {
    if (!config.recordTxStatus) return
    if (txStatuses.length === 0) return
    const response = await axios.post(`http://${config.explorerRPCDataServerInfo.externalIp}:${config.explorerRPCDataServerInfo.externalPort}/tx/status`, txStatuses)
    console.log('forward Tx Status To Explorer', response.data)
}

export const methods = {
    web3_clientVersion: async function (args: any, callback: any) {
        const api_name = 'web3_clientVersion'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())

        if (verbose) {
            console.log('Running web3_clientVersion', args)
        }
        if (verbose) {
            console.log('Running getCurrentBlockInfo', args)
        }
        let result = "Mist/v0.9.3/darwin/go1.4.1"
        callback(null, result);

        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    web3_sha3: async function (args: any, callback: any) {
        const api_name = 'web3_sha3'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())

        if (verbose) {
            console.log('Running web3_sha', args)
        }
        let result = "0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad"
        callback(null, result);

        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    net_version: async function (args: any, callback: any) {
        const api_name = 'net_version'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())

        if (verbose) {
            console.log('Running net_version', args)
        }
        let chainId = config.chainId
        callback(null, chainId);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    net_listening: async function (args: any, callback: any) {
        const api_name = 'net_listening'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running net_listening', args)
        }
        let result = true
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    net_peerCount: async function (args: any, callback: any) {
        const api_name = 'net_peerCount'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running net_peerCount', args)
        }
        let result = "0x2"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_protocolVersion: async function (args: any, callback: any) {
        const api_name = 'eth_protocolVersion'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running eth_protocolVersion', args)
        }
        let result = "54"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_syncing: async function (args: any, callback: any) {
        const api_name = 'eth_syncing'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running eth_syncing', args)
        }
        let result = "false"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_coinbase: async function (args: any, callback: any) {
        const api_name = 'eth_coinbase'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running eth_coinbase', args)
        }
        let result = ""
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_mining: async function (args: any, callback: any) {
        const api_name = 'eth_mining'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running eth_mining', args)
        }
        let result = true
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_hashrate: async function (args: any, callback: any) {
        const api_name = 'eth_hashrate'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running eth_hashrate', args)
        }
        let result = "0x38a"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_gasPrice: async function (args: any, callback: any) {
        const api_name = 'eth_gasPrice'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running eth_gasPrice', args)
        }
        let result = "0x1dfd14000"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_accounts: async function (args: any, callback: any) {
        const api_name = 'eth_accounts'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running eth_accounts', args)
        }
        let result = ["0x407d73d8a49eeb85d32cf465507dd71d507100c1"]
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_blockNumber: async function (args: any, callback: any) {
        const api_name = 'eth_blockNumber'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running eth_blockNumber', args)
        }
        let {blockNumber} = await getCurrentBlockInfo()
        if (verbose) console.log('BLOCK NUMBER', blockNumber, parseInt(blockNumber, 16))
        if (blockNumber == null) {
            callback(null, '0x0');
            logEventEmitter.emit('fn_end',ticket,performance.now())
        }
        else {
            callback(null, blockNumber)
            logEventEmitter.emit('fn_end',ticket,performance.now())
        }
    },
    eth_getBalance: async function (args: any, callback: any) {
        const api_name = 'eth_getBalance'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running eth_getBalance', args)
        }
        let balance = '0x0'
        try {
            let address = args[0]
            if (verbose) console.log('address', address)
            if (verbose) console.log('ETH balance', typeof balance, balance)
            let account = await getAccount(address)
            if (verbose) console.log('account', account)
            if (verbose) console.log('Shardium balance', typeof account.balance, account.balance)
            let SHD = intStringToHex(account.balance)
            if (verbose) console.log('SHD', typeof SHD, SHD)
            balance = intStringToHex(account.balance)

        } catch (e) {
            // if (verbose) console.log('Unable to get account balance', e)
        }
        if (verbose) console.log('Final balance', balance)
        callback(null, balance);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getStorageAt: async function (args: any, callback: any) {
        const api_name = 'eth_getStorageAt'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running eth_getStorageAt', args)
        }
        let result = "0x00000000000000000000000000000000000000000000000000000000000004d2"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getTransactionCount: async function (args: any, callback: any) {
        const api_name = 'eth_getTransactionCount'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running getTransactionCount', args)
        }
        try {
            let address = args[0]
            let account = await getAccount(address)
            if (account) {
                let nonce = parseInt(account.nonce)
                let result = '0x' + nonce.toString(16)
                if (result === '0x') result = '0x0'
                if (verbose) {
                    console.log('account.nonce', account.nonce)
                    console.log('Transaction count', result)
                }
                callback(null, result);
            } else {
                callback(null, '0x0')
            }
        } catch (e) {
            if(verbose) console.log('Unable to getTransactionCount', e)
        }finally{
            logEventEmitter.emit('fn_end',ticket,performance.now())
        }
    },
    eth_getBlockTransactionCountByHash: async function (args: any, callback: any) {
        const api_name = 'eth_getBlockTransactionCountByHash'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())

        if (verbose) {
            console.log('Running getBlockTransactionCountByHash', args)
        }
        let result = "0xb"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())

    },
    eth_getBlockTransactionCountByNumber: async function (args: any, callback: any) {
        const api_name = 'eth_getBlockTransactionCountByNumber'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running getBlockTransactionCountByNumber', args)
        }
        let result = "0xa"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getUncleCountByBlockHash: async function (args: any, callback: any) {
        const api_name = 'eth_getUncleCountByBlockHash'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running getUncleCountByBlockHash', args)
        }
        let result = "0x1"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getUncleCountByBlockNumber: async function (args: any, callback: any) {
        const api_name = 'eth_getUncleCountByBlockNumber'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running getUnbleCountByBlockNumber', args)
        }
        let result = "0x1"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getCode: async function (args: any, callback: any) {
        const api_name = 'eth_getCode'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running getCode', args)
        }
        try {
            const emptyCodeHash = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
            const account = await getAccount(args[0])
            // if (account && account.codeHash && account.codeHash) {
            if (account && account.codeHash && account.codeHash !== emptyCodeHash) {
                if (verbose) console.log('eth_getCode result', account.codeHash)
                callback(null, account.codeHash)
                return
            }
            let result = "0x0"
            if (verbose) console.log('eth_getCode result', result)
            callback(null, result);
        } catch (e) {
            console.log('Unable to eth_getCode', e)
        }finally{
            logEventEmitter.emit('fn_end',ticket,performance.now())
        }
    },
    eth_signTransaction: async function (args: any, callback: any) {
        const api_name = 'eth_signTransaction'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running eth_signTransaction', args)
        }
        let result = "0xa3f20717a250c2b0b729b7e5becbff67fdaef7e0699da4de7ca5895b02a170a12d887fd3b17bfdce3481f10bea41f45ba9f709d39ce8325427b57afcfc994cee1b"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_sendTransaction: async function (args: any, callback: any) {
        const api_name = 'eth_sendTransaction'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())

        if (verbose) {
            console.log('Running sendTransaction', args)
        }
        let result = "0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99d05921026d1527331"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_sendRawTransaction: async function (args: any, callback: any) {
        const api_name = 'eth_sendRawTransaction'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        let now = Date.now()
        if (verbose) {
            console.log('Sending raw tx to /inject endpoint', new Date(now), now)
            console.log('Running sendRawTransaction', args)
        }
        try {
            let raw = args[0]
            let tx: any = {
                raw
            }
            if (config.generateTxTimestamp) tx.timestamp = now
            const transaction = getTransactionObj(tx)

            const txHash = bufferToHex(transaction.hash())
            const currentTxNonce = transaction.nonce.toNumber()
            const sender = transaction.getSenderAddress().toString()

            if (config.nonceValidate && txMemPool[sender] && txMemPool[sender].length > 0) {
                let maxIteration = txMemPool[sender].length
                let count = 0
                while(count < maxIteration) {
                    count++

                    if (txMemPool[sender][0].nonce < currentTxNonce && txMemPool[sender][0].nonce === nonceTracker[sender] + 1) {
                        let pendingTx = txMemPool[sender].shift()
                        console.log(`Injecting pending tx in the mem pool`, pendingTx.nonce)
                        injectAndRecordTx(txHash, pendingTx.tx, args)
                        nonceTracker[sender] = pendingTx.nonce
                        console.log(`Pending tx count for ${sender}: ${txMemPool[sender].length}`)
                        await sleep(500)
                    }
                }
            }

            let lastTxNonce = nonceTracker[sender]

            if (config.nonceValidate && lastTxNonce && currentTxNonce > lastTxNonce + 1) {
                console.log('BUG: Incorrect tx nonce sequence', lastTxNonce, currentTxNonce);
                if (txMemPool[sender]) {
                    txMemPool[sender].push({nonce: currentTxNonce, tx})
                    txMemPool[sender] = txMemPool[sender].sort((a: any, b:any) => a.nonce - b.nonce)
                } else {
                    txMemPool[sender] = [{nonce: currentTxNonce, tx}]
                }
                nonceTracker[sender] = currentTxNonce
                return txHash
            }

            injectAndRecordTx(txHash, tx, args)

            callback(null, txHash);
        } catch (e) {
            console.log(`Error while injecting tx to consensor`, e)
        } finally {
            logEventEmitter.emit('fn_end',ticket,performance.now())
        }
    },
    eth_call: async function (args: any, callback: any) {
        const api_name = 'eth_call'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running eth_call', args)
        }
        let callObj = args[0]
      //callObj.gasPrice = new BN(0)
        if (!callObj.from) {
            callObj['from'] = '0x2041B9176A4839dAf7A4DcC6a97BA023953d9ad9'
        }
        if (verbose) console.log('callObj', callObj)
        try {
          let baseUrl = getBaseUrl()
            let res = await requestWithRetry('post', `/contract/call`, callObj)
            if (verbose) console.log('contract call res.data.result', callObj, baseUrl, res.data.result)
            if (res.data == null || res.data.result == null) {
                //callback(null, errorHexStatus)
                callback(errorBusy)
                logEventEmitter.emit('fn_end',ticket,performance.now())
                return
            }
            let result = '0x' + res.data.result
            if (verbose) console.log('eth_call result from', baseUrl, result)
            callback(null, result);
            logEventEmitter.emit('fn_end',ticket,performance.now())
        } catch (e) {
            console.log(`Error while making an eth call`, e)
            //callback(null, errorHexStatus)
            callback(errorBusy)
            logEventEmitter.emit('fn_end',ticket,performance.now())
        }
    },
    eth_estimateGas: async function (args: any, callback: any) {
        const api_name = 'eth_estimateGas'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running estimateGas', args)
        }
        let result = "0x1C9C380" // 30 M gas
        try {
            //   const res = await axios.post(`${getBaseUrl()}/eth_estimateGas`, args[0])
            //   const gasUsed = res.data.result
            //   if(verbose) console.log('Gas used', gasUsed)
            //if(gasUsed) result = '0x' + gasUsed
        } catch (e) {
            console.log('Estimate gas error', e)
        }
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getBlockByHash: async function (args: any, callback: any) {
        const api_name = 'eth_getBlockByHash'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running getBlockByHash', args)
        }
        //getCurrentBlock handles errors, no try catch needed
        let result = await getCurrentBlock()
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getBlockByNumber: async function (args: any, callback: any) {
        const api_name = 'eth_getBlockByNumber'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running getBlockByNumber', args)
        }
        let blockNumber = args[0]
        if(blockNumber !== 'latest') blockNumber = parseInt(blockNumber, 16)
        let res = await requestWithRetry('get', `/eth_getBlockByNumber?blockNumber=${blockNumber}`)
        let result = res.data.block
        if (verbose) console.log('BLOCK DETAIL', result)
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getTransactionByHash: async function (args: any, callback: any) {
        const api_name = 'eth_getTransactionByHash'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running getTransactionByHash', args)
        }
        let txHash = args[0]
        let retry = 0
        let success = false
        let result
        let defaultResult: any = {
            "blockHash": "0x1d59ff54b1eb26b013ce3cb5fc9dab3705b415a67127a003c3e61eb445bb8df2",
            "blockNumber": "0x5daf3b", // 6139707
            "from": "0xa7d9ddbe1f17865597fbd27ec712455208b6b76d",
            "gas": "0xc350", // 50000
            "gasPrice": "0x4a817c800", // 20000000000
            "hash": "0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b",
            "input": "0x68656c6c6f21",
            "nonce": "0x15", // 21
            "to": "0xf02c1c8e6114b1dbe8937a39260b5b0a374432bb",
            "transactionIndex": "0x41", // 65
            "value": "0xf3dbb76162000", // 4290000000000000
            "v": "0x25", // 37
            "r": "0x1b5e176d927f8e9ab405058b2d2457392da3e20f328b16ddabcebc33eaac5fea",
            "s": "0x4ba69724e8f69de52f0125ad8b3c5c2cef33019bac3249e2c0a2192766d1721c"
        }
        while (retry < 10 && !success) {
            try {
                //let res = await axios.get(`${getBaseUrl()}/tx/${txHash}`)
                let res = await requestWithRetry('get', `/tx/${txHash}`)
                result = res.data.account ? res.data.account.readableReceipt : null
                if (result == null) {
                    if (verbose) {
                        console.log('tx', txHash, result)
                        console.log('Awaiting tx data for txHash', txHash)
                    }
                    if (config.queryFromArchiver) {
                        console.log('querying eth_getTransactionByHash from archiver');

                        res = await axios.get(`${getArchiverUrl()}/transaction?accountId=${txHash.substring(2)}`)
                        // console.log('res', res)
                        result = res.data.accounts ? res.data.accounts.data.readableReceipt : null
                    }
                    if (result === null) {
                        await sleep(2000)
                        retry += 1
                        continue
                    }
                }
                success = true
            } catch (e) {
                if(verbose) console.log('Error: eth_getTransactionByHash', e)
                retry += 1
                await sleep(2000)
            }
        }
        if (!result) {
            logEventEmitter.emit('fn_end',ticket,performance.now())
            callback(errorBusy)
            return
        }
        if (!result.to) result.to = '0x' + '0'.repeat(42)
        if (result.value === '0') {
            result.value = '0x0'
        }

        if (verbose) console.log('result.from', result.from)

        let nonce = parseInt(result.nonce, 16)
        defaultResult.hash = result.transactionHash
        defaultResult.from = result.from
        defaultResult.to = result.to
        defaultResult.nonce = nonce
        defaultResult.contractAddress = result.contractAddress
        if (verbose) console.log('Final Tx:', txHash, defaultResult)
        callback(null, defaultResult);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getTransactionByBlockHashAndIndex: async function (args: any, callback: any) {
        const api_name = 'eth_getTransactionByBlockHashAndIndex'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running getTransactionByBlockHashAndIndex', args)
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getTransactionByBlockNumberAndIndex: async function (args: any, callback: any) {
        const api_name = 'eth_getTransactionByBlockNumberAndIndex'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running getTransactionByBlockNumberAndIndex', args)
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getTransactionReceipt: async function (args: any, callback: any) {
        const api_name = 'eth_getTransactionReceipt'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        let now = Date.now()
        if (verbose) {
            console.log('Getting tx receipt', new Date(now), now)
            console.log('Running getTransactionReceipt', args)
        }
        try {
            let txHash = args[0]
            let res = await requestWithRetry('get', `/tx/${txHash}`)
            let result = res.data.account ? res.data.account.readableReceipt : null
            if (!result && config.queryFromArchiver) {
                if (verbose) console.log('querying eth_getTransactionReceipt from archiver');

                res = await axios.get(`${getArchiverUrl()}/transaction?accountId=${txHash.substring(2)}`)
                if (verbose) {
                    console.log('url', `${getArchiverUrl()}/account?accountId=${txHash.substring(2)}`)
                    console.log('res', JSON.stringify(res.data))
                }
                
                // console.log('res', res)
                result = res.data.accounts ? res.data.accounts.data.readableReceipt : null
            }
            if (result) {
                if (!result.to || result.to == '') result.to = null
                if (result.logs == null) result.logs = []
                if (result.status == 0) result.status = '0x0'
                if (result.status == 1) result.status = '0x1'
                if (verbose) console.log(`getTransactionReceipt result for ${txHash}`, result)
            }
            callback(null, result);
            logEventEmitter.emit('fn_end',ticket,performance.now())
        } catch (e) {
            console.log('Unable to eth_getTransactionReceipt', e)
            //callback(null, errorHexStatus)
            callback(errorBusy)
            logEventEmitter.emit('fn_end',ticket,performance.now())
        }
    },
    eth_getUncleByBlockHashAndIndex: async function (args: any, callback: any) {
        const api_name = 'eth_getUncleByBlockHashAndIndex'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running getUncleByBlockHashAndIndex', args)
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getUncleByBlockNumberAndIndex: async function (args: any, callback: any) {
        const api_name = 'eth_getUncleByBlockNumberAndIndex'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running getUncleByBlockNumberAndIndex', args)
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getCompilers: async function (args: any, callback: any) {
        const api_name = 'eth_getCompilers'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running getCompilers', args)
        }
        let result = ["solidity", "lll", "serpent"]
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_compileSolidity: async function (args: any, callback: any) {
        const api_name = 'eth_compileSolidity'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running compileSolidity', args)
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_compileLLL: async function (args: any, callback: any) {
        const api_name = 'eth_compileLLL'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_compileSerpent: async function (args: any, callback: any) {
        const api_name = 'eth_compileSerpent'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_newBlockFilter: async function (args: any, callback: any) {
        const api_name = 'eth_newBlockFilter'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "0x1"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_newPendingTransactionFilter: async function (args: any, callback: any) {
        const api_name = 'eth_newPendingTransactionFilter'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running newPendingTransactionFilter', args)
        }
        let result = "0x1"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_uninstallFilter: async function (args: any, callback: any) {
        const api_name = 'eth_uninstallFilter'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = true
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getFilterChanges: async function (args: any, callback: any) {
        const api_name = 'eth_getFilterChanges'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getFilterLogs: async function (args: any, callback: any) {
        const api_name = 'eth_getFilterLogs'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getLogs: async function (args: any, callback: any) {
        const api_name = 'eth_getLogs'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running getLogs', args)
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getWork: async function (args: any, callback: any) {
        const api_name = 'eth_getWork'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_submitWork: async function (args: any, callback: any) {
        const api_name = 'eth_submitWork'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_submitHashrate: async function (args: any, callback: any) {
        const api_name = 'eth_submitHashrate'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    db_putString: async function (args: any, callback: any) {
        const api_name = 'db_putString'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    db_getString: async function (args: any, callback: any) {
        const api_name = 'db_getString'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    db_putHex: async function (args: any, callback: any) {
        const api_name = 'db_putHex'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    db_getHex: async function (args: any, callback: any) {
        const api_name = 'db_getHex'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    shh_version: async function (args: any, callback: any) {
        const api_name = 'shh_version'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    shh_post: async function (args: any, callback: any) {
        const api_name = 'shh_post'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    shh_newIdentity: async function (args: any, callback: any) {
        const api_name = 'shh_newIdentity'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    shh_hasIdentity: async function (args: any, callback: any) {
        const api_name = 'shh_hasIdentity'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    shh_newGroup: async function (args: any, callback: any) {
        const api_name = 'shh_newGroup'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    shh_addToGroup: async function (args: any, callback: any) {
        const api_name = 'shh_addToGroup'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    shh_newFilter: async function (args: any, callback: any) {
        const api_name = 'shh_newFilter'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    shh_uninstallFilter: async function (args: any, callback: any) {
        const api_name = 'shh_uninstallFilter'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    shh_getFilterChanges: async function (args: any, callback: any) {
        const api_name = 'shh_getFilterChanges'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    shh_getMessages: async function (args: any, callback: any) {
        const api_name = 'shh_getMessages'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
        }
        let result = "test"
        callback(null, result);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_chainId: async function (args: any, callback: any) {
        const api_name = 'eth_chainId'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (verbose) {
            console.log('Running eth_chainId', args)
        }
        let chainId = `${config.chainId}`
        let hexValue = '0x' + parseInt(chainId, 10).toString(16)
        callback(null, hexValue);
        logEventEmitter.emit('fn_end',ticket,performance.now())
    },
    eth_getAccessList: async function(args: any, callback: any) {
        const api_name = 'eth_getAccessList'
        const ticket = crypto.createHash('sha1')
            .update(api_name + Math.random() + Date.now())
            .digest('hex');
        logEventEmitter.emit('fn_start',ticket,api_name,performance.now())
        if (true) {
            console.log('Running eth_getAccessList', args)
        }
        let callObj = args[0]
        if (!callObj.from) {
            callObj['from'] = '0x2041B9176A4839dAf7A4DcC6a97BA023953d9ad9'
        }
        console.log('callObj', callObj)

        try {
            let baseUrl = getBaseUrl()
            let res = await requestWithRetry('post', `/contract/accesslist`, callObj)
            if (verbose) console.log('contract eth_getAccessList res.data', callObj, baseUrl, res.data)
            if (res.data == null || res.data.accessList == null) {
                callback(errorBusy)
                logEventEmitter.emit('fn_end',ticket,performance.now())
                return
            }
            if (verbose) console.log('predicted accessList from', baseUrl, JSON.stringify(res.data.accessList))
            callback(null, res.data.accessList);
            logEventEmitter.emit('fn_end',ticket,performance.now())
        } catch (e) {
            console.log(`Error while making an eth call`, e)
            callback(errorBusy)
            logEventEmitter.emit('fn_end',ticket,performance.now())
        }
    },
}
