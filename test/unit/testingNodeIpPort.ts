import net from 'net'

function isValidIP(ip: string): boolean {
  return net.isIP(ip) !== 0 // Returns 4 for IPv4, 6 for IPv6, or 0 for invalid
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535
}

export function sanitizeIpAndPort(ipPort: string): { isValid: boolean; error?: string } {
  const [ip, portStr] = ipPort.split(':')

  // Check if both IP and port are provided
  if (!ip || !portStr) {
    return { isValid: false, error: 'IP and port must both be provided' }
  }

  // Validate IP
  if (!isValidIP(ip)) {
    return { isValid: false, error: 'Invalid IP address' }
  }

  // Convert port to a number and validate
  const port = Number(portStr)
  if (!isValidPort(port)) {
    return { isValid: false, error: 'Invalid port number' }
  }

  return { isValid: true }
}

// Test cases for sanitizeIpAndPort function
const testCases = [
  { input: '192.168.1.1:8080', expected: true },
  { input: '256.256.256.256:8080', expected: false }, // Invalid IP
  { input: '192.168.1.1:70000', expected: false }, // Invalid port
  { input: '127.0.0.1', expected: false }, // Missing port
  { input: 'localhost:8080', expected: false }, // Invalid IP format
]

function test(): void {
  for (const { input, expected } of testCases) {
    const result = sanitizeIpAndPort(input)
    const passed = result.isValid === expected

    if (passed) {
      console.log(`Test passed for input "${input}" - Expected: ${expected}, Got: ${result.isValid}`)
    } else {
      console.error(`Test failed for input "${input}" - Expected: ${expected}, Got: ${result.isValid}`)
    }
  }
}

test()
