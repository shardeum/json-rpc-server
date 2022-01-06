import axios from "axios";
import {bufferToHex} from "ethereumjs-util";
import { getTransactionObj, getAccount, intStringToHex, sleep } from './utils'

export let baseUrl = 'http://localhost:9001'

async function getCurrentBlockNumber() {
    let result = '0x0'
    try {
        let res = await axios.get(`${baseUrl}/sync-newest-cycle`)
        let cycle = res.data.newestCycle
        let result = intStringToHex(cycle.counter)
        console.log('cycle counter', result)
        console.log("Running eth_blockNumber")
    } catch (e) {
        console.log('Unable to get cycle number', e)
    }
    return result
}

async function getCurrentBlock() {
    let blockNumber = await getCurrentBlockNumber()
    let result = {
        "difficulty": "0x4ea3f27bc",
        "extraData": "0x476574682f4c5649562f76312e302e302f6c696e75782f676f312e342e32",
        "gasLimit": "0x1388",
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
        "timestamp": "0x55ba467c",
        "totalDifficulty": "0x78ed983323d",
        "transactions": [
        ],
        "transactionsRoot": "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
        "uncles": [
        ]
    }
    return result
}

export const methods = {
    web3_clientVersion: async function (args: any, callback: any) {
        let result = "Mist/v0.9.3/darwin/go1.4.1"
        console.log("Running web3_clientVersion")
        callback(null, result);
    },
    web3_sha3: async function (args: any, callback: any) {
        let result = "0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad"
        console.log("Running web3_sha3")
        callback(null, result);
    },
    net_version: async function (args: any, callback: any) {
        let chainId = 1409
        callback(null, chainId);
    },
    net_listening: async function (args: any, callback: any) {
        let result = true
        console.log("Running net_listening")
        callback(null, result);
    },
    net_peerCount: async function (args: any, callback: any) {
        let result = "0x2"
        console.log("Running net_peerCount")
        callback(null, result);
    },
    eth_protocolVersion: async function (args: any, callback: any) {
        let result = "54"
        console.log("Running eth_protocolVersion")
        callback(null, result);
    },
    eth_syncing: async function (args: any, callback: any) {
        let result = "false"
        console.log("Running test")
        callback(null, result);
    },
    eth_coinbase: async function (args: any, callback: any) {
        let result = ""
        console.log("Running test")
        callback(null, result);
    },
    eth_mining: async function (args: any, callback: any) {
        let result = true
        console.log("Running test")
        callback(null, result);
    },
    eth_hashrate: async function (args: any, callback: any) {
        let result = "0x38a"
        console.log("Running test")
        callback(null, result);
    },
    eth_gasPrice: async function (args: any, callback: any) {
        let result = "0x1dfd14000"
        console.log("Running eth_gasPrice")
        callback(null, result);
    },
    eth_accounts: async function (args: any, callback: any) {
        let result = ["0x407d73d8a49eeb85d32cf465507dd71d507100c1"]
        console.log("Running eth_accounts")
        callback(null, result);
    },
    eth_blockNumber: async function (args: any, callback: any) {
        let result = await getCurrentBlockNumber()
        callback(null, result);
    },
    eth_getBalance: async function (args: any, callback: any) {
        let balance = '0x0'
        try {
            console.log('Getting eth_getBalance', args)
            let address = args[0]
            console.log('address', address)
            console.log('ETH balance', typeof balance, balance)
            let account = await getAccount(address)
            console.log('account', account)
            console.log('Shardium balance', typeof account.balance, account.balance)
            let SHD = intStringToHex(account.balance)
            console.log('SHD', typeof SHD, SHD)
            balance = intStringToHex(account.balance)

        } catch (e) {
            console.log('Unable to get account balance')
        }
        console.log('Final balance', balance)
        callback(null, balance);
    },
    eth_getStorageAt: async function (args: any, callback: any) {
        let result = "0x00000000000000000000000000000000000000000000000000000000000004d2"
        console.log("Running eth_getStorageAt")
        callback(null, result);
    },
    eth_getTransactionCount: async function (args: any, callback: any) {
        let address = args[0]
        let account = await getAccount(address)
        if (account) {
            let result = bufferToHex(Buffer.from(account.nonce, 'hex'))
            if (result === '0x') result = '0x0'
            console.log("Running eth_getTransactionCount", args)
            console.log('Transaction count', result)
            callback(null, result);
        } else {
            callback(null, '0x0')
        }
    },
    eth_getBlockTransactionCountByHash: async function (args: any, callback: any) {
        let result = "0xb"
        console.log("Running eth_getBlockTransactionCountByHash")
        callback(null, result);
    },
    eth_getBlockTransactionCountByNumber: async function (args: any, callback: any) {
        let result = "0xa"
        console.log("Running eth_getBlockTransactionCountByNumber")
        callback(null, result);
    },
    eth_getUncleCountByBlockHash: async function (args: any, callback: any) {
        let result = "0x1"
        console.log("Running eth_getUncleCountByBlockHash")
        callback(null, result);
    },
    eth_getUncleCountByBlockNumber: async function (args: any, callback: any) {
        let result = "0x1"
        console.log("Running eth_getUncleCountByBlockNumber")
        callback(null, result);
    },
    eth_getCode: async function (args: any, callback: any) {
        let result = "0x600160008035811a818181146012578301005b601b6001356025565b8060005260206000f25b600060078202905091905056"
        console.log("Running eth_getCode")
        callback(null, result);
    },
    eth_sign: async function (args: any, callback: any) {
        let result = "0xa3f20717a250c2b0b729b7e5becbff67fdaef7e0699da4de7ca5895b02a170a12d887fd3b17bfdce3481f10bea41f45ba9f709d39ce8325427b57afcfc994cee1b"
        console.log("Running eth_sign")
        callback(null, result);
    },
    eth_signTransaction: async function (args: any, callback: any) {
        let result = "0xa3f20717a250c2b0b729b7e5becbff67fdaef7e0699da4de7ca5895b02a170a12d887fd3b17bfdce3481f10bea41f45ba9f709d39ce8325427b57afcfc994cee1b"
        console.log("Running eth_signTransaction")
        callback(null, result);
    },
    eth_sendTransaction: async function (args: any, callback: any) {
        let result = "0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99d05921026d1527331"
        console.log("Running eth_sendTransaction", args)
        // let tx = args[0]
        // let res = await axios.post(`${baseUrl}/inject`, tx)
        callback(null, result);
    },
    eth_sendRawTransaction: async function (args: any, callback: any) {
        let raw = args[0]
        let tx = {
            raw,
            timestamp: Date.now()
        }
        await axios.post(`${baseUrl}/inject`, tx)
        console.log("Running eth_sendRawTransaction", args)

        const transaction = getTransactionObj(tx)
        const result = bufferToHex(transaction.hash())

        console.log('Tx Hash', result)

        callback(null, result);
    },
    eth_call: async function (args: any, callback: any) {
        // let result = '0x0'
        console.log("Running eth_call", args)
        let callObj = args[0]
        if (!callObj.from) {
            callObj['from'] = ''
        }
        let res = await axios.post(`${baseUrl}/contract/call`, callObj)
        console.log('res.data.result', res.data.result)
        if (res.data.result == null || res.data.result == undefined) {
            callback(null, '0x0')
            return
        }
        let result = '0x' + res.data.result
        console.log('eth_call result', result)
        callback(null, result);
    },
    eth_estimateGas: async function (args: any, callback: any) {
        let result = "0x2DC6C0"
        console.log("Running eth_estimateGas")
        callback(null, result);
    },
    eth_getBlockByHash: async function (args: any, callback: any) {
        let result = await getCurrentBlock()
        console.log("Running eth_getBlockByHash")
        callback(null, result);
    },
    eth_getBlockByNumber: async function (args: any, callback: any) {
        let result = await getCurrentBlock()
        console.log("Running eth_getBlockByNumber", result)
        callback(null, result);
    },
    eth_getTransactionByHash: async function (args: any, callback: any) {
        console.log("Running eth_getTransactionByHash", args)
        let txHash = args[0]
        let retry = 0
        let success = false
        let result
        let defaultResult: any = {
            "blockHash":"0x1d59ff54b1eb26b013ce3cb5fc9dab3705b415a67127a003c3e61eb445bb8df2",
            "blockNumber":"0x5daf3b", // 6139707
            "from":"0xa7d9ddbe1f17865597fbd27ec712455208b6b76d",
            "gas":"0xc350", // 50000
            "gasPrice":"0x4a817c800", // 20000000000
            "hash":"0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b",
            "input":"0x68656c6c6f21",
            "nonce":"0x15", // 21
            "to":"0xf02c1c8e6114b1dbe8937a39260b5b0a374432bb",
            "transactionIndex":"0x41", // 65
            "value":"0xf3dbb76162000", // 4290000000000000
            "v":"0x25", // 37
            "r":"0x1b5e176d927f8e9ab405058b2d2457392da3e20f328b16ddabcebc33eaac5fea",
            "s":"0x4ba69724e8f69de52f0125ad8b3c5c2cef33019bac3249e2c0a2192766d1721c"
        }
        while(retry < 10 && !success) {
            let res = await axios.get(`${baseUrl}/tx/${txHash}`)
            result = res.data.tx
            if (!result.transactionHash) {
                console.log('tx', txHash, result)
                console.log('Awaiting tx data for txHash', txHash)
                await sleep(5000)
                continue
            }
            success = true
        }
        if (!result.to) result.to = '0x' + '0'.repeat(42)
        if (result.value === '0') {
            result.value = '0x0'
        }

        console.log('result.from', result.from)


        defaultResult.hash = result.transactionHash
        defaultResult.from = result.from
        defaultResult.to = result.to
        defaultResult.nonce = bufferToHex(Buffer.from(result.nonce, 'hex'))
        defaultResult.contractAddress = result.contractAddress
        console.log('Final Tx:', txHash, defaultResult)
        callback(null, defaultResult);
    },
    eth_getTransactionByBlockHashAndIndex: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running eth_getBlocketh_getTransactionByBlockHashAndIndexByNumber")
        callback(null, result);
    },
    eth_getTransactionByBlockNumberAndIndex: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running eth_getTransactionByBlockNumberAndIndex")
        callback(null, result);
    },
    eth_getTransactionReceipt: async function (args: any, callback: any) {
        // console.log("Running eth_getTransactionReceipt", args)
        let txHash = args[0]
        let res = await axios.get(`${baseUrl}/tx/${txHash}`)
        let result = res.data.tx
        // console.log('tx receipt', txHash, result)
        callback(null, result);
    },
    eth_getUncleByBlockHashAndIndex: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running eth_getUncleByBlockHashAndIndex")
        callback(null, result);
    },
    eth_getUncleByBlockNumberAndIndex: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running eth_getUncleByBlockNumberAndIndex")
        callback(null, result);
    },
    eth_getCompilers: async function (args: any, callback: any) {
        let result = ["solidity", "lll", "serpent"]
        console.log("Running test")
        callback(null, result);
    },
    eth_compileSolidity: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    eth_compileLLL: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    eth_compileSerpent: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    eth_newBlockFilter: async function (args: any, callback: any) {
        let result = "0x1"
        console.log("Running test")
        callback(null, result);
    },
    eth_newPendingTransactionFilter: async function (args: any, callback: any) {
        let result = "0x1"
        console.log("Running test")
        callback(null, result);
    },
    eth_uninstallFilter: async function (args: any, callback: any) {
        let result = true
        console.log("Running test")
        callback(null, result);
    },
    eth_getFilterChanges: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    eth_getFilterLogs: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    eth_getLogs: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    eth_getWork: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    eth_submitWork: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    eth_submitHashrate: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    db_putString: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running db_putString")
        callback(null, result);
    },
    db_getString: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running db_getString")
        callback(null, result);
    },
    db_putHex: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running db_putHex")
        callback(null, result);
    },
    db_getHex: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running db_getHex")
        callback(null, result);
    },
    shh_version: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    shh_post: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    shh_newIdentity: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    shh_hasIdentity: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    shh_newGroup: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    shh_addToGroup: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    shh_newFilter: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    shh_uninstallFilter: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    shh_getFilterChanges: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    shh_getMessages: async function (args: any, callback: any) {
        let result = "test"
        console.log("Running test")
        callback(null, result);
    },
    eth_chainId: async function (args: any, callback: any) {
        let chainId = '8080'
        let hexValue = '0x' + parseInt(chainId, 10).toString(16)
        callback(null, hexValue);
    },
}
