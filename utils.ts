const {toBuffer} = require("ethereumjs-util");
const {Transaction, AccessListEIP2930Transaction} = require("@ethereumjs/tx");
const axios = require("axios");
const config = require("./config.json")
export let node = {
    ip: 'localhost',
    port: 9001
}

let verbose = config.verbose

let gotArchiver = false

export function getTransactionObj(tx: any): any {
    if (!tx.raw) throw Error('No raw tx found.')
    let transactionObj
    const serializedInput = toBuffer(tx.raw)
    try {
        transactionObj = Transaction.fromRlpSerializedTx(serializedInput)
        if (verbose) console.log('Legacy tx parsed:', transactionObj)
    } catch (e) {
        if (verbose) console.log('Unable to get legacy transaction obj', e)
    }
    if (!transactionObj) {
        try {
            transactionObj = AccessListEIP2930Transaction.fromRlpSerializedTx(serializedInput)
            if (verbose) console.log('EIP2930 tx parsed:', transactionObj)
        } catch (e) {
            console.log('Unable to get EIP2930 transaction obj', e)
        }
    }

    if (transactionObj) {
        return transactionObj
    } else throw Error('tx obj fail')
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

async function rotateConsensorNode() {
  let consensor: any = await getRandomConsensorNode()
  if (consensor){
    let nodeIp = consensor.ip
    //Sometimes the external IPs returned will be local IPs.  This happens with pm2 hosting multpile nodes on one server.
    //config.useConfigNodeIp will override the local IPs with the config node external IP when rotating nodes
    if(config.useConfigNodeIp === true){
        nodeIp = config.nodeIpInfo.externalIp
    }
    changeNode(nodeIp, consensor.port)      
  }
}

export async function setConsensorNode() {
  if (config.dynamicConsensorNode) {
    await rotateConsensorNode()
    setInterval(rotateConsensorNode, parseInt(config.rotationInterval) * 1000)
  } else {
    changeNode(config.nodeIpInfo.externalIp, config.nodeIpInfo.externalPort)
  }
}

export async function getRandomConsensorNode() {

  if(config.askLocalHostForArchiver === true){
    if(gotArchiver === false){
        gotArchiver = true
        //TODO query a localhost (or other) node or a valid archiver IP
    }
  }

  const res = await axios.get(`http://${config.archiverIpInfo.externalIp}:${config.archiverIpInfo.externalPort}/nodelist`)
  const nodeList = res.data.nodeList
  if (nodeList.length > 0) {
    let randomIndex = Math.floor(Math.random() * nodeList.length)
    return nodeList[randomIndex]
  }
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
        if (verbose) console.log(`${getBaseUrl()}/account/${addressStr}`)
        let res = await axios.get(`${getBaseUrl()}/account/${addressStr}`)
        return res.data.account
    } catch (e) {
        console.log('getAccount error', e)
    }
}
