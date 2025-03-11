import fs from 'fs'
import axios from 'axios'
import { CONFIG } from '../config'
import { sanitizeIpAndPort } from '../utils'
import { Utils } from '@shardeum-foundation/lib-types'

// Set to store foundation node IP:PORT combinations
const foundationNodesSet = new Set<string>()
let foundationNodesCount = 0
let isFeatureEnabled = false

// Default port for foundation nodes
const DEFAULT_PORT = 9001

/**
 * Load foundation nodes from a JSON file
 */
async function loadFoundationNodesFromFile(): Promise<boolean> {
    try {
        const filePath = CONFIG.foundationNodeFilter.filePath
        if (!fs.existsSync(filePath)) {
            console.error(`Foundation nodes file not found: ${filePath}`)
            return false
        }

        const data = fs.readFileSync(filePath, 'utf8')
        const foundationNodesData = Utils.safeJsonParse(data)

        foundationNodesSet.clear()
        if (foundationNodesData.nodes && Array.isArray(foundationNodesData.nodes)) {
            foundationNodesData.nodes.forEach((node: string) => {
                if (typeof node === 'string') {
                    // If node already has port, use it as is
                    const ipPort = node.includes(':') ? node : `${node}:${DEFAULT_PORT}`

                    // Sanitize IP and port
                    const validation = sanitizeIpAndPort(ipPort)
                    if (validation.isValid) {
                        foundationNodesSet.add(ipPort)
                    }
                }
            })
        } else {
            console.error('Foundation nodes file has invalid format')
            return false
        }

        foundationNodesCount = foundationNodesSet.size
        return true
    } catch (error) {
        console.error(`Error loading foundation nodes from file: ${error}`)
        return false
    }
}

/**
 * Load foundation nodes from an endpoint
 */
async function loadFoundationNodesFromEndpoint(): Promise<boolean> {
    try {
        const endpointUrl = CONFIG.foundationNodeFilter.endpointUrl
        if (!endpointUrl) {
            console.error('Foundation nodes endpoint URL is not configured')
            return false
        }

        const response = await axios.get(endpointUrl, { timeout: CONFIG.axiosTimeoutInMs })
        const foundationNodesData = response.data
        foundationNodesSet.clear()
        if (foundationNodesData.nodes && Array.isArray(foundationNodesData.nodes)) {
            foundationNodesData.nodes.forEach((node: string) => {
                if (typeof node === 'string') {
                    // If node already has port, use it as is
                    const ipPort = node.includes(':') ? node : `${node}:${DEFAULT_PORT}`
                    // Sanitize IP and port
                    const validation = sanitizeIpAndPort(ipPort)
                    if (validation.isValid) {
                        foundationNodesSet.add(ipPort)
                    }
                }
            })
        } else {
            console.error('Foundation nodes endpoint returned invalid format')
            return false
        }

        foundationNodesCount = foundationNodesSet.size
        return true
    } catch (error) {
        console.error(`Error loading foundation nodes from endpoint: ${error}`)
        return false
    }
}

/**
 * Load foundation nodes based on config - from file or endpoint
 * Prefer endpoint if it's enabled
 * This should be called once per cycle to refresh the foundation nodes list
 */
export async function loadFoundationNodes(): Promise<boolean> {
    if (!CONFIG.foundationNodeFilter.enabled) {
        isFeatureEnabled = false
        return false
    }

    let success = false
    if (CONFIG.foundationNodeFilter.useEndpoint) {
        success = await loadFoundationNodesFromEndpoint()
    } else {
        success = await loadFoundationNodesFromFile()
    }

    // Check if we have enough foundation nodes
    if (success && foundationNodesCount >= CONFIG.foundationNodeFilter.minFoundationNodesForInjectFilter) {
        isFeatureEnabled = true
    } else {
        if (success) {
            console.error(
                `Not enough foundation nodes (${foundationNodesCount}) to enable filtering. ` +
                `Minimum required: ${CONFIG.foundationNodeFilter.minFoundationNodesForInjectFilter}`
            )
        }
        isFeatureEnabled = false
    }

    return isFeatureEnabled
}

/**
 * Check if a node is in the foundation list
 */
export function isFoundationNode(ipPort: string): boolean {
    // Sanitize the ipPort
    const validation = sanitizeIpAndPort(ipPort)
    if (!validation.isValid) {
        return false
    }
    return foundationNodesSet.has(ipPort)
}

/**
 * Check if foundation node filtering is currently enabled
 */
export function isFoundationNodeFilteringEnabled(): boolean {
    return isFeatureEnabled
}

/**
 * Get the count of foundation nodes
 */
export function getFoundationNodesCount(): number {
    return foundationNodesCount
} 