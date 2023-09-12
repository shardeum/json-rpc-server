export interface GasEstimate {
  contractAddress: string
  functionSignature: string
  gasUsed: string
  gasRefund: string
  timestamp: number
}

export function checkEntry(contractAddress: string, functionSig: string): boolean {
  return true
}

export function addEntry(entry: GasEstimate): void {
  // placeholder
  // Add new entry
  // If present, always overwrite
}

export function getGasEstimate(contractAddress: string, functionSig: string): GasEstimate {
  throw new Error('Function not implemented')
}
