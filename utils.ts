const {toBuffer} = require("ethereumjs-util");
const {Transaction} = require("@ethereumjs/tx");
const axios = require("axios");
export let node = {
    ip: 'localhost',
    port: 9001
}

export function getTransactionObj (tx: any) {
    if (!tx.raw) return
    try {
        const serializedInput = toBuffer(tx.raw)
        return Transaction.fromRlpSerializedTx(serializedInput)
    } catch (e) {
        console.log('Unable to get transaction obj', e)
    }
}

export function intStringToHex(str: string) {
    return '0x' + parseInt(str, 10).toString(16)
}
export function getBaseUrl() {
    return `http://${node.ip}:${node.port}`
}

export function changeNode(ip: string, port: number) {
    node.ip = ip
    node.port = port
    console.log(`RPC server subscribes to ${ip}:${port}`)
}


export function sleep(ms: number) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(true)
        }, ms)
    })
}

export async function getAccount(addressStr: any) {
    try {
        console.log(`${getBaseUrl()}/account/${addressStr}`)
        let res = await axios.get(`${getBaseUrl()}/account/${addressStr}`)
        return res.data.account
    } catch (e) {
        console.log('getAccount error', e)
    }
}
