import * as fs from 'fs'
import { AccessListEIP2930Transaction, Transaction } from '@ethereumjs/tx'
import { toBuffer } from 'ethereumjs-util'
import { BLACKLIST_FILE, SPAMMERLIST_FILE } from './constants'
import { CONFIG as config } from '../../config'
import { OriginalTxData } from '../../types'

/**
 * Writes IP to blacklist file
 */
export function writeToBlacklist(ip: string): void {
  try {
    const currentDataStr = fs.readFileSync(BLACKLIST_FILE)
    const ipList = JSON.parse(currentDataStr.toString())
    if (ipList.indexOf(ip) >= 0) return
    const newIpList = [...ipList, ip]
    if (config.verbose) console.log(`Added IP ${ip} to banned list`)
    fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(newIpList))
  } catch (e) {
    if (config.verbose) console.log('Error writing to blacklist.json', e)
  }
}

/**
 * Writes address to spammer list file
 */
export function writeToSpammerList(address: string): void {
  try {
    fs.readFile(SPAMMERLIST_FILE, (err: NodeJS.ErrnoException | null, currentDataStr: Buffer) => {
      const spammerList = JSON.parse(currentDataStr.toString())
      if (spammerList.indexOf(address) >= 0) return
      const newSpammerList = [...spammerList, address]
      console.log(`Added address ${address} to spammer list`)
      fs.writeFileSync(SPAMMERLIST_FILE, JSON.stringify(newSpammerList))
    })
  } catch (e) {
    console.log('Error writing to spammerlist.json', e)
  }
}

export function writeNewBlacklistWithRetry(bannedIps: string[]): void {
  // Only update the file if there were changes
  if (config.verbose) console.log('New banned IPs', bannedIps)
  try {
    fs.writeFileSync('blacklist.json', JSON.stringify(bannedIps))
    if (config.verbose) console.log('Updated blacklist.json with current banned IPs')

    // Verify the bannedIps list is updated
    const verifyData = JSON.parse(fs.readFileSync('blacklist.json', 'utf8'))
    if (verifyData.length !== bannedIps.length) {
      if (config.verbose) console.log('Warning: Inconsistency detected between bannedIps and blacklist.json')
      // Update the file to match the in-memory bannedIps
      fs.writeFileSync('blacklist.json', JSON.stringify(bannedIps))
      if (config.verbose) console.log('Updated blacklist.json to match in-memory bannedIps')
    }
  } catch (error) {
    if (config.verbose) console.error('Error writing to or verifying blacklist.json', error)
  }
}

/**
 * Gets transaction object from raw transaction data
 */
export function getTransactionObj(tx: OriginalTxData): Transaction | AccessListEIP2930Transaction {
  if (!tx.raw) throw Error('No raw tx found.')
  let transactionObj
  const serializedInput = toBuffer(tx.raw)
  try {
    transactionObj = Transaction.fromRlpSerializedTx(serializedInput)
    // if (verbose) console.log('Legacy tx parsed:', transactionObj)
  } catch (e) {
    // if (verbose) console.log('Unable to get legacy transaction obj', e)
  }
  if (!transactionObj) {
    try {
      transactionObj = AccessListEIP2930Transaction.fromRlpSerializedTx(serializedInput)
      if (config.verbose) console.log('EIP2930 tx parsed:', transactionObj)
    } catch (e) {
      console.log('Unable to get EIP2930 transaction obj', e)
    }
  }

  if (transactionObj) {
    return transactionObj
  } else throw Error('tx obj fail')
}

/**
 * Sleep utility function
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Validates if a request type is a query (non-heavy) request
 */
export function isQueryType(reqType: string): boolean {
  const heavyTypes = ['eth_sendRawTransaction', 'eth_sendTransaction']
  return !heavyTypes.includes(reqType)
}
