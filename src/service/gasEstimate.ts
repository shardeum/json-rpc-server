export interface GasEstimate {
  contractAddress: string
  functionSignature: string
  gasUsed: number
  gasRefund: number
  timestamp: number
}

export function checkEntry(entry: GasEstimate): boolean {
  return true
}

export function addEntry(entry: GasEstimate): void {
  // placeholder
}

export function getGasEstimate(): void {
  // placeholder
}
