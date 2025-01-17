import { sanitizeIpAndPort } from '../../src/utils'

// Mock the methods object from the API module
jest.mock('../../src/api', () => ({
  methods: {
    eth_getBalance: jest.fn(),
    eth_sendTransaction: jest.fn(),
    // Mock other methods as needed
  },
}))

describe('sanitizeIpAndPort', () => {
  it('should return error if IP and port are not both provided', () => {
    const result = sanitizeIpAndPort('192.168.1.1') // Missing port
    expect(result).toEqual({ isValid: false, error: 'IP and port must both be provided' })
  })

  it('should return error if IP is invalid', () => {
    const result = sanitizeIpAndPort('invalidIP:8080')
    expect(result).toEqual({ isValid: false, error: 'Invalid IP address' })
  })

  it('should return error if port is invalid', () => {
    const result = sanitizeIpAndPort('192.168.1.1:99999') // Assuming 99999 is an invalid port
    expect(result).toEqual({ isValid: false, error: 'Invalid port number' })
  })

  it('should return isValid true if IP and port are valid', () => {
    const result = sanitizeIpAndPort('192.168.1.1:8080')
    expect(result).toEqual({ isValid: true })
  })
})
