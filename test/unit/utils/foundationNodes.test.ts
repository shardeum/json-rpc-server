import fs from 'fs'
import axios from 'axios'
import {
  loadFoundationNodes,
  isFoundationNode,
  isFoundationNodeFilteringEnabled,
  getFoundationNodesCount,
} from '../../../src/utils/foundationNodes'
import { CONFIG } from '../../../src/config'
import { sanitizeIpAndPort } from '../../../src/utils'

// Mock dependencies
jest.mock('fs')
jest.mock('axios')
jest.mock('../../../src/config', () => ({
  CONFIG: {
    foundationNodeFilter: {
      enabled: true,
      useEndpoint: false,
      endpointUrl: 'http://127.0.0.1/foundation-nodes',
      filePath: './foundation-nodes.json',
      minFoundationNodesForInjectFilter: 3,
    },
    axiosTimeoutInMs: 5000,
  },
}))
jest.mock('../../../src/utils', () => ({
  sanitizeIpAndPort: jest.fn(),
}))

describe('Foundation Nodes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset the mocked sanitizeIpAndPort to return valid by default
    const mockedSanitizeIpAndPort = sanitizeIpAndPort as jest.MockedFunction<typeof sanitizeIpAndPort>
    mockedSanitizeIpAndPort.mockReturnValue({ isValid: true })
  })

  describe('loadFoundationNodes', () => {
    it('should return false when feature is disabled', async () => {
      // Temporarily override CONFIG
      const originalConfig = { ...CONFIG.foundationNodeFilter }
      CONFIG.foundationNodeFilter.enabled = false

      const result = await loadFoundationNodes()

      expect(result).toBe(false)
      expect(isFoundationNodeFilteringEnabled()).toBe(false)

      // Restore original config
      CONFIG.foundationNodeFilter = originalConfig
    })

    it('should load foundation nodes from file successfully', async () => {
      // Setup mocks
      CONFIG.foundationNodeFilter.useEndpoint = false
      const mockFileData = JSON.stringify({
        nodes: ['192.168.1.1', '192.168.1.2:9001', '192.168.1.3'],
      })

      const mockedFs = fs as jest.Mocked<typeof fs>
      mockedFs.existsSync.mockReturnValue(true)
      mockedFs.readFileSync.mockReturnValue(mockFileData)

      const result = await loadFoundationNodes()

      expect(result).toBe(true)
      expect(isFoundationNodeFilteringEnabled()).toBe(true)
      expect(getFoundationNodesCount()).toBe(3)
      expect(mockedFs.readFileSync).toHaveBeenCalledWith('./foundation-nodes.json', 'utf8')
    })

    it('should handle file not found error', async () => {
      // Setup mocks
      CONFIG.foundationNodeFilter.useEndpoint = false
      const mockedFs = fs as jest.Mocked<typeof fs>
      mockedFs.existsSync.mockReturnValue(false)

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await loadFoundationNodes()

      expect(result).toBe(false)
      expect(isFoundationNodeFilteringEnabled()).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Foundation nodes file not found'))

      consoleSpy.mockRestore()
    })

    it('should handle invalid JSON in file', async () => {
      // Setup mocks
      CONFIG.foundationNodeFilter.useEndpoint = false
      const mockedFs = fs as jest.Mocked<typeof fs>
      mockedFs.existsSync.mockReturnValue(true)
      mockedFs.readFileSync.mockReturnValue('invalid json')

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await loadFoundationNodes()

      expect(result).toBe(false)
      expect(isFoundationNodeFilteringEnabled()).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error loading foundation nodes from file'))

      consoleSpy.mockRestore()
    })

    it('should handle invalid format in file', async () => {
      // Setup mocks
      CONFIG.foundationNodeFilter.useEndpoint = false
      const mockFileData = JSON.stringify({
        invalid: 'format',
      })

      const mockedFs = fs as jest.Mocked<typeof fs>
      mockedFs.existsSync.mockReturnValue(true)
      mockedFs.readFileSync.mockReturnValue(mockFileData)

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await loadFoundationNodes()

      expect(result).toBe(false)
      expect(isFoundationNodeFilteringEnabled()).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith('Foundation nodes file has invalid format')

      consoleSpy.mockRestore()
    })

    it('should load foundation nodes from endpoint successfully', async () => {
      // Setup mocks
      CONFIG.foundationNodeFilter.useEndpoint = true
      const mockResponseData = {
        nodes: ['192.168.1.1', '192.168.1.2:9001', '192.168.1.3', '192.168.1.4'],
      }

      const mockedAxios = axios as jest.Mocked<typeof axios>
      mockedAxios.get.mockResolvedValue({ data: mockResponseData })

      const result = await loadFoundationNodes()

      expect(result).toBe(true)
      expect(isFoundationNodeFilteringEnabled()).toBe(true)
      expect(getFoundationNodesCount()).toBe(4)
      expect(mockedAxios.get).toHaveBeenCalledWith('http://127.0.0.1/foundation-nodes', {
        timeout: CONFIG.axiosTimeoutInMs,
      })
    })

    it('should handle endpoint request failure', async () => {
      // Setup mocks
      CONFIG.foundationNodeFilter.useEndpoint = true
      const mockedAxios = axios as jest.Mocked<typeof axios>
      mockedAxios.get.mockRejectedValue(new Error('Network error'))

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await loadFoundationNodes()

      expect(result).toBe(false)
      expect(isFoundationNodeFilteringEnabled()).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error loading foundation nodes from endpoint'))

      consoleSpy.mockRestore()
    })

    it('should handle invalid format from endpoint', async () => {
      // Setup mocks
      CONFIG.foundationNodeFilter.useEndpoint = true
      const mockResponseData = {
        invalid: 'format',
      }

      const mockedAxios = axios as jest.Mocked<typeof axios>
      mockedAxios.get.mockResolvedValue({ data: mockResponseData })

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await loadFoundationNodes()

      expect(result).toBe(false)
      expect(isFoundationNodeFilteringEnabled()).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith('Foundation nodes endpoint returned invalid format')

      consoleSpy.mockRestore()
    })

    it('should not enable filtering if not enough foundation nodes', async () => {
      // Setup mocks
      CONFIG.foundationNodeFilter.useEndpoint = false
      CONFIG.foundationNodeFilter.minFoundationNodesForInjectFilter = 5
      const mockFileData = JSON.stringify({
        nodes: ['192.168.1.1', '192.168.1.2'],
      })

      const mockedFs = fs as jest.Mocked<typeof fs>
      mockedFs.existsSync.mockReturnValue(true)
      mockedFs.readFileSync.mockReturnValue(mockFileData)

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await loadFoundationNodes()

      expect(result).toBe(false)
      expect(isFoundationNodeFilteringEnabled()).toBe(false)
      expect(getFoundationNodesCount()).toBe(2)
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Not enough foundation nodes'))

      consoleSpy.mockRestore()
    })
  })

  describe('isFoundationNode', () => {
    beforeEach(async () => {
      // Setup foundation nodes
      CONFIG.foundationNodeFilter.useEndpoint = false
      const mockFileData = JSON.stringify({
        nodes: ['192.168.1.1', '192.168.1.2:9001', '192.168.1.3'],
      })

      const mockedFs = fs as jest.Mocked<typeof fs>
      mockedFs.existsSync.mockReturnValue(true)
      mockedFs.readFileSync.mockReturnValue(mockFileData)

      await loadFoundationNodes()
    })

    it('should return true for a node in the foundation list', () => {
      expect(isFoundationNode('192.168.1.1:9001')).toBe(true)
      expect(isFoundationNode('192.168.1.2:9001')).toBe(true)
      expect(isFoundationNode('192.168.1.3:9001')).toBe(true)
    })

    it('should return false for a node not in the foundation list', () => {
      expect(isFoundationNode('192.168.1.4:9001')).toBe(false)
      expect(isFoundationNode('10.0.0.1:9001')).toBe(false)
    })

    it('should return false for invalid IP:PORT format', () => {
      const mockedSanitizeIpAndPort = sanitizeIpAndPort as jest.MockedFunction<typeof sanitizeIpAndPort>
      mockedSanitizeIpAndPort.mockReturnValue({ isValid: false, error: 'Invalid format' })

      expect(isFoundationNode('invalid-format')).toBe(false)
      expect(sanitizeIpAndPort).toHaveBeenCalledWith('invalid-format')
    })
  })

  describe('isFoundationNodeFilteringEnabled', () => {
    it('should return the current state of filtering', async () => {
      // Initially disabled
      expect(isFoundationNodeFilteringEnabled()).toBe(false)

      // Enable filtering
      CONFIG.foundationNodeFilter.useEndpoint = false
      CONFIG.foundationNodeFilter.minFoundationNodesForInjectFilter = 3
      const mockFileData = JSON.stringify({
        nodes: ['192.168.1.1', '192.168.1.2', '192.168.1.3', '192.168.1.4'],
      })

      const mockedFs = fs as jest.Mocked<typeof fs>
      mockedFs.existsSync.mockReturnValue(true)
      mockedFs.readFileSync.mockReturnValue(mockFileData)

      await loadFoundationNodes()

      expect(isFoundationNodeFilteringEnabled()).toBe(true)
    })
  })

  describe('getFoundationNodesCount', () => {
    beforeEach(() => {
      // Reset the module state by reloading it
      jest.resetModules()
      jest.clearAllMocks()
    })

    it('should return the correct count of foundation nodes', async () => {
      // Load nodes
      CONFIG.foundationNodeFilter.useEndpoint = false
      CONFIG.foundationNodeFilter.minFoundationNodesForInjectFilter = 3
      const mockFileData = JSON.stringify({
        nodes: ['192.168.1.1', '192.168.1.2', '192.168.1.3'],
      })

      const mockedFs = fs as jest.Mocked<typeof fs>
      mockedFs.existsSync.mockReturnValue(true)
      mockedFs.readFileSync.mockReturnValue(mockFileData)

      await loadFoundationNodes()

      expect(getFoundationNodesCount()).toBe(3)
    })
  })
})
