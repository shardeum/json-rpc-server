import { readableBlock } from '../external/Collector'

type CacheEntry = {
  key: string
  value: readableBlock
}

export class BlockCacheManager {
  private lastNBlocks: CacheEntry[]

  //we need a map for both hash and block number look ups.
  //the good thing is that they will point to the same data so that is not a big concern here
  private lruCache: Map<string, readableBlock>
  private N: number
  private M: number

  constructor(N: number, M: number) {
    this.N = N
    this.M = M
    this.lastNBlocks = []
    this.lruCache = new Map()
  }

  // need to change from a cacheKey being passed into adjusting generating that in our code
  // we need to normalize the look up so that if we insert something it just goes in as a block,
  // but we could find it by hash or number.   earliest will be a special case
  get(cacheKey: string): readableBlock | undefined {
    // todo need to avoid the linear search here.  should likely check first on the map
    // 
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

  //update will not take a cache key.   it should take the    inpType and 'block' but will prob rename block to blockQueryValue
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
