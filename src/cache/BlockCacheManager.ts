import { readableBlock } from '../external/Collector'

type CacheEntry = {
  key: string
  value: readableBlock
}

export class BlockCacheManager {
  private lastNBlocks: CacheEntry[]
  private lruCache: Map<string, readableBlock>
  private N: number
  private M: number

  constructor(N: number, M: number) {
    this.N = N
    this.M = M
    this.lastNBlocks = []
    this.lruCache = new Map()
  }

  get(cacheKey: string): readableBlock | undefined {
    const cachedBlock = this.lastNBlocks.find((entry) => entry.key === cacheKey)?.value

    if (cachedBlock) {
      return cachedBlock
    }

    const lruCachedBlock = this.lruCache.get(cacheKey)
    if (lruCachedBlock) {
      this.lruCache.delete(cacheKey)
      this.lruCache.set(cacheKey, lruCachedBlock)
    }

    return lruCachedBlock
  }

  update(cacheKey: string, block: readableBlock): void {
    if (this.lastNBlocks.length >= this.N) {
      this.lastNBlocks.shift()
    }
    this.lastNBlocks.push({ key: cacheKey, value: block })

    if (this.lruCache.size >= this.M) {
      const firstKey = this.lruCache.keys().next().value
      this.lruCache.delete(firstKey)
    }
    this.lruCache.set(cacheKey, block)
  }
}
