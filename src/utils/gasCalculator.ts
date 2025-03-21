import { BigNumber } from '@ethersproject/bignumber'

/**
 * Calculates the total gas used from an array of transactions
 * @param transactions Array of transactions with optional gas values
 * @returns Hex string of total gas used, without leading zeros (except for 0x0)
 */
export function calculateBlockGasUsed(transactions: any[]): string {
  let blockGasUsed = BigNumber.from(0)
  transactions.forEach((tx: any) => {
    const gasUsedHex = tx.wrappedEVMAccount?.readableReceipt?.gasUsed
    if (gasUsedHex && gasUsedHex !== '0x' && gasUsedHex !== '0x0') {
      try {
        const gasValue = BigNumber.from(gasUsedHex)
        blockGasUsed = blockGasUsed.add(gasValue)
      } catch (gasError) {
        console.warn('Invalid gas value in transaction:', tx.hash, gasUsedHex)
      }
    }
  })

  // Handle special case for zero
  if (blockGasUsed.isZero()) {
    return '0x0'
  }

  // Convert to hex and remove leading zeros
  const hexString = blockGasUsed.toHexString()
  return hexString.replace(/0x0+/, '0x')
}
