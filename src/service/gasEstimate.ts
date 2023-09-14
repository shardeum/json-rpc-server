import { db } from '../storage/sqliteStorage'

export interface GasEstimate {
  contractAddress: string
  functionSignature: string
  gasUsed: string
  gasRefund: string
  timestamp: number
}

export function checkEntry(contractAddress: string, functionSig: string): boolean {
  const entry = findEntryByContractAndSignature(contractAddress, functionSig)
  return entry !== undefined
}

export function addEntry(entry: GasEstimate): void {
  insertOrUpdateGasEstimate(entry)
}

export function getGasEstimate(contractAddress: string, functionSig: string): GasEstimate {
  const entry = findEntryByContractAndSignature(contractAddress, functionSig)
  if (!entry) {
    throw new Error('Entry not found')
  }
  return entry
}

function findEntryByContractAndSignature(
  contract_address: string,
  function_signature: string
): GasEstimate | undefined {
  const stmt = db.prepare(
    'SELECT * FROM gas_estimations WHERE contract_address = ? AND function_signature = ?'
  )
  const result = stmt.get(contract_address, function_signature)
  return result
    ? {
        contractAddress: result.contract_address,
        functionSignature: result.function_signature,
        gasUsed: result.gasUsed,
        gasRefund: result.gasRefund,
        timestamp: result.timestamp,
      }
    : undefined
}

function insertOrUpdateGasEstimate(entry: GasEstimate): void {
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO gas_estimations (contract_address, function_signature, gasUsed, gasRefund, timestamp) VALUES (?, ?, ?, ?, ?)'
  )
  stmt.run(entry.contractAddress, entry.functionSignature, entry.gasUsed, entry.gasRefund, entry.timestamp)
}
