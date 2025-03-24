import { calculateBlockGasUsed } from '../../../src/utils/gasCalculator'

describe('gasCalculator', () => {
  describe('calculateBlockGasUsed', () => {
    it('should return 0x0 for empty transactions', () => {
      const result = calculateBlockGasUsed([])
      expect(result).toBe('0x0')
    })

    it('should handle single transaction with valid gas', () => {
      const transactions = [
        {
          wrappedEVMAccount: {
            readableReceipt: {
              gasUsed: '0x123',
              hash: '0xabc',
            },
          },
        },
      ]
      const result = calculateBlockGasUsed(transactions)
      expect(result).toBe('0x123')
    })

    it('should sum multiple transactions with valid gas', () => {
      const transactions = [
        {
          wrappedEVMAccount: {
            readableReceipt: {
              gasUsed: '0x123',
              hash: '0xabc',
            },
          },
        },
        {
          wrappedEVMAccount: {
            readableReceipt: {
              gasUsed: '0x456',
              hash: '0xdef',
            },
          },
        },
      ]
      const result = calculateBlockGasUsed(transactions)
      expect(result).toBe('0x579')
    })

    it('should handle zero gas values', () => {
      const transactions = [
        {
          wrappedEVMAccount: {
            readableReceipt: {
              gasUsed: '0x0',
              hash: '0xabc',
            },
          },
        },
        {
          wrappedEVMAccount: {
            readableReceipt: {
              gasUsed: '0x123',
              hash: '0xdef',
            },
          },
        },
      ]
      const result = calculateBlockGasUsed(transactions)
      expect(result).toBe('0x123')
    })

    it('should handle empty gas values', () => {
      const transactions = [
        {
          wrappedEVMAccount: {
            readableReceipt: {
              gasUsed: '',
              hash: '0xabc',
            },
          },
        },
        {
          wrappedEVMAccount: {
            readableReceipt: {
              gasUsed: '0x123',
              hash: '0xdef',
            },
          },
        },
      ]
      const result = calculateBlockGasUsed(transactions)
      expect(result).toBe('0x123')
    })

    it('should handle invalid gas values', () => {
      const transactions = [
        {
          wrappedEVMAccount: {
            readableReceipt: {
              gasUsed: 'invalid',
              hash: '0xabc',
            },
          },
        },
        {
          wrappedEVMAccount: {
            readableReceipt: {
              gasUsed: '0x123',
              hash: '0xdef',
            },
          },
        },
      ]
      const result = calculateBlockGasUsed(transactions)
      expect(result).toBe('0x123')
    })

    it('should handle missing gas values', () => {
      const transactions = [
        {
          wrappedEVMAccount: {
            readableReceipt: {
              hash: '0xabc',
            },
          },
        },
        {
          wrappedEVMAccount: {
            readableReceipt: {
              gasUsed: '0x123',
              hash: '0xdef',
            },
          },
        },
      ]
      const result = calculateBlockGasUsed(transactions)
      expect(result).toBe('0x123')
    })

    it('should handle missing wrappedEVMAccount', () => {
      const transactions = [
        {
          hash: '0xabc',
        },
        {
          wrappedEVMAccount: {
            readableReceipt: {
              gasUsed: '0x123',
              hash: '0xdef',
            },
          },
        },
      ]
      const result = calculateBlockGasUsed(transactions)
      expect(result).toBe('0x123')
    })
  })
})
