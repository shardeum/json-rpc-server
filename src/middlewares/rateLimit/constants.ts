import { CONFIG as config } from '../../config'

export const ONE_SECOND = 1000
export const ONE_MINUTE = 60 * ONE_SECOND
export const ONE_HOUR = 60 * ONE_MINUTE

export const BLACKLIST_FILE = 'blacklist.json'
export const SPAMMERLIST_FILE = 'spammerlist.json'

// Response messages
export const MESSAGES = {
  BANNED_IP: 'This IP is banned.',
  RATE_LIMIT_EXCEEDED: 'Rejected by rate-limiting',
  NETWORK_BUSY: 'Network is currently busy. Please try again later.',
  INTERNAL_ERROR: 'Internal server error during rate limiting',
  SENDER_BLACKLISTED: 'Sender is blacklisted.',
  NODE_ROTATION: 'Node is close to rotation edges.',
} 