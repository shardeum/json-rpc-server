const {toBuffer} = require("ethereumjs-util");
const {Transaction} = require("@ethereumjs/tx");
const axios = require("axios");
import { baseUrl } from "./api";

export function getTransactionObj (tx: any) {
    if (!tx.raw) return
    try {
        const serializedInput = toBuffer(tx.raw)
        return Transaction.fromRlpSerializedTx(serializedInput)
    } catch (e) {
        console.log('Unable to get transaction obj', e)
    }
}

export function stringToHex(str: string) {
    return '0x' + parseInt(str, 10).toString(16)
}

export async function getAccount(addressStr: any) {
    try {
        let res = await axios.get(`${baseUrl}/account/${addressStr}`)
        return res.data.account
    } catch (e) {
        console.log('getAccount error', e)
    }
}
