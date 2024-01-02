import { db } from '../storage/sqliteStorage'

export interface GasEstimate {
  contractAddress: string
  functionSignature: string
  gasEstimate: string
  timestamp: number
}

/**
 * Checks if the gas estimate for a contract function is valid.
 * 
 * @param contractAddress - The address of the contract.
 * @param functionSig - The function signature.
 * @param gasEstimateInvalidationIntervalInMs - The interval in milliseconds after which the gas estimate is considered invalid.
 * @returns A boolean indicating whether the gas estimate is valid.
 */
export function checkEntry(
  contractAddress: string,
  functionSig: string,
  gasEstimateInvalidationIntervalInMs: number
): boolean {
  if (!contractAddress || !functionSig) {
    return false
  }
  const entry = findEntryByContractAndSignature(contractAddress, functionSig)
  if (entry == null) {
    return false
  }
  return Date.now() - entry.timestamp <= gasEstimateInvalidationIntervalInMs
}

/**
 * Removes an entry from the gas_estimations table based on the contract address and function signature.
 * 
 * @param contractAddress - The contract address.
 * @param functionSig - The function signature.
 */
export function removeEntry(contractAddress: string, functionSig: string): void {
  if (!contractAddress || !functionSig) {
    return
  }
  const stmt = db.prepare('DELETE FROM gas_estimations WHERE contract_address = ? AND function_signature = ?')
  stmt.run(contractAddress, functionSig)
}

/**
 * Adds an entry to the gas estimate.
 * 
 * @param entry - The gas estimate entry to be added.
 */
export function addEntry(entry: GasEstimate): void {
  insertOrUpdateGasEstimate(entry)
}

/**
 * Retrieves the gas estimate for a given contract address and function signature.
 * 
 * @param contractAddress - The address of the contract.
 * @param functionSig - The function signature.
 * @returns The gas estimate for the specified contract and function.
 * @throws Error if the entry is not found.
 */
export function getGasEstimate(contractAddress: string, functionSig: string): GasEstimate {
  const entry = findEntryByContractAndSignature(contractAddress, functionSig)
  if (!entry) {
    throw new Error('Entry not found')
  }
  return entry
}

/**
 * Finds a gas estimate entry in the database by contract address and function signature.
 * 
 * @param contract_address - The address of the contract.
 * @param function_signature - The signature of the function.
 * @returns The gas estimate entry if found, otherwise undefined.
 */
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
        gasEstimate: result.gasEstimate,
        timestamp: result.timestamp,
      }
    : undefined
}

/**
 * Inserts or updates a gas estimate entry in the database.
 * 
 * @param entry - The gas estimate entry to be inserted or updated.
 */
function insertOrUpdateGasEstimate(entry: GasEstimate): void {
  if (!entry.contractAddress || !entry.functionSignature) {
    return
  }
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO gas_estimations (contract_address, function_signature, gasEstimate, timestamp) VALUES (?, ?, ?, ?)'
  )
  stmt.run(entry.contractAddress, entry.functionSignature, entry.gasEstimate, entry.timestamp)
}
