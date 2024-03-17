import { readableBlock } from '../external/Collector'
import { nestedCountersInstance } from '../utils/nestedCounters'

type CacheEntry = {
  key: string
  value: readableBlock
}

//reference to block as stored by the collector db 
      // export interface DbBlock {
      //   number: number
      //   numberHex: string
      //   hash: string
      //   timestamp: number
      //   cycle: number
      //   readableBlock: string
      // }



export class BlockCacheManager {
  //private lastNBlocks: CacheEntry[]

  //we need a map for both hash and block number look ups.
  //the good thing is that they will point to the same data so that is not a big concern here
  private lruCacheByHexNum: Map<string, readableBlock>
  private lruCacheByHash: Map<string, readableBlock>
  private earliest: readableBlock | undefined
  private N: number
  private M: number

  constructor(N: number, M: number) {
    this.N = N
    this.M = M
    //this.lastNBlocks = []
    this.lruCacheByHexNum = new Map()
    this.lruCacheByHash = new Map()
    this.earliest = undefined
  }

  // need to change from a cacheKey being passed into adjusting generating that in our code
  // we need to normalize the look up so that if we insert something it just goes in as a block,
  // but we could find it by hash or number.   earliest will be a special case
  get(blockSearchValue: string, blockSearchType: 'hex_num' | 'hash' | 'tag'): readableBlock | undefined {


    if(blockSearchValue != 'earliest'){
      if(blockSearchValue.startsWith('0x')){
        nestedCountersInstance.countEvent('blockcache', `search 0x ${blockSearchType}`)
      } else if (blockSearchValue.startsWith('0X')){
        nestedCountersInstance.countEvent('blockcache', `search 0X ${blockSearchType}`)
      } else {
        nestedCountersInstance.countEvent('blockcache', `search _ ${blockSearchType}`)
      }
    }


    let cachedBlock = undefined
    if(blockSearchValue === 'earliest'){
      cachedBlock = this.earliest
    } else if (blockSearchType === 'hash'){
      cachedBlock = this.lruCacheByHash.get(blockSearchValue)
    } else if (blockSearchType === 'hex_num'){
      cachedBlock = this.lruCacheByHexNum.get(blockSearchValue)   
    }
    if(cachedBlock != undefined){
      nestedCountersInstance.countEvent('blockcache', `hit ${blockSearchType}`)

      //update lru for each cache
      const blockHash = cachedBlock.hash
      const hex_num = cachedBlock.number
      //update cache by hash
      this.lruCacheByHash.delete(blockHash)
      this.lruCacheByHash.set(blockHash, cachedBlock)
  
      //udpate cache by block hex num 
      this.lruCacheByHexNum.delete(hex_num)
      this.lruCacheByHexNum.set(hex_num, cachedBlock)

    } else {
      nestedCountersInstance.countEvent('blockcache', `miss ${blockSearchType} ${blockSearchValue}`)

    }

    return cachedBlock
  }

  //update will not take a cache key.   it should take the    inpType and 'block' but will prob rename block to blockQueryValue
  update(blockSearchValue: string, blockSearchType: 'hex_num' | 'hash' | 'tag', block: readableBlock): void {
    //nestedCountersInstance.countEvent('blockcache', `update ${blockSearchType}`)    
    

    if(blockSearchValue != 'earliest'){
      if(blockSearchValue.startsWith('0x')){
        nestedCountersInstance.countEvent('blockcache', `update 0x ${blockSearchType}`)
      } else if (blockSearchValue.startsWith('0X')){
        nestedCountersInstance.countEvent('blockcache', `update 0X ${blockSearchType} ${blockSearchValue}`)
      } else {
        nestedCountersInstance.countEvent('blockcache', `update _ ${blockSearchType} ${blockSearchValue}`)
        blockSearchValue = '0x' + blockSearchValue
      }
    }


    if (blockSearchValue === 'earliest') {
      //update earliest
      this.earliest = block
      return
    }

    if (blockSearchValue === 'latest') {
      const hash = block.hash
      //insert by hash 
      this.lruCacheByHash.delete(hash)
      this.lruCacheByHash.set(hash, block)
    }  else if (blockSearchType === 'hash'){
        this.lruCacheByHash.delete(blockSearchValue)
        this.lruCacheByHash.set(blockSearchValue, block)
    } else if (blockSearchType === 'hex_num'){
        this.lruCacheByHexNum.delete(blockSearchValue)
        this.lruCacheByHexNum.set(blockSearchValue, block)

    }

    const blockHash = block.hash
    const hex_num = block.number //this is already in hex
    //update cache by hash
    this.lruCacheByHash.delete(blockHash)
    this.lruCacheByHash.set(blockHash, block)

    //udpate cache by block hex num 
    this.lruCacheByHexNum.delete(hex_num)
    this.lruCacheByHexNum.set(hex_num, block)


    // resize cache if needed
    if (this.lruCacheByHash.size >= this.M) {
      const firstKey = this.lruCacheByHash.keys().next().value
      this.lruCacheByHash.delete(firstKey)
      nestedCountersInstance.countEvent('blockcache', `clean lruCacheByHash ${this.lruCacheByHash.size}`)
    }
    // resize cache if needed
    if (this.lruCacheByHexNum.size >= this.M) {
      const firstKey = this.lruCacheByHexNum.keys().next().value
      this.lruCacheByHexNum.delete(firstKey)
      nestedCountersInstance.countEvent('blockcache', `clean lruCacheByHexNum ${this.lruCacheByHexNum.size}`)
    }

  }
}
