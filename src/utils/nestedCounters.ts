import { Response } from 'express-serve-static-core'

type CounterMap = Map<string, CounterNode>
interface CounterNode {
  count: number
  subCounters: CounterMap
}

type CounterArray = {
  key: string
  count: number
  subArray: CounterArray
}[]

class NestedCounters {
  eventCounters: Map<string, CounterNode>

  constructor() {
    this.eventCounters = new Map()
  }

  /**
   * Increments event counter map for a specified category and sub category
   * @param category1 Primary category to be updated
   * @param category2 Sub counter category
   * @param count Amount to increment primary and sub counter by. Defaults to 1
   */
  countEvent(category1: string, category2: string, count = 1): void {
    let counterMap: CounterMap = this.eventCounters

    let nextNode: CounterNode | null = null
    if (!counterMap.has(category1)) {
      nextNode = { count: 0, subCounters: new Map() }
      counterMap.set(category1, nextNode)
    } else {
      nextNode = counterMap.get(category1) as CounterNode
    }
    nextNode.count += count
    counterMap = nextNode.subCounters

    //unrolled loop to avoid memory alloc
    category1 = category2
    if (counterMap.has(category1) === false) {
      nextNode = { count: 0, subCounters: new Map() }
      counterMap.set(category1, nextNode)
    } else {
      nextNode = counterMap.get(category1) as CounterNode
    }
    nextNode.count += count
    counterMap = nextNode.subCounters
  }

  /**
   * Recursively convert the counterMap to an array and sort by the count property
   * @param counterMap
   * @returns sorted array of counts
   */
  arrayitizeAndSort(counterMap: CounterMap): CounterArray {
    const array: CounterArray = []
    for (const key of counterMap.keys()) {
      const valueObj = counterMap.get(key)
      if (valueObj) {
        const newValueObj = { key, count: valueObj.count, subArray: [] as CounterArray }
        array.push(newValueObj)

        if (valueObj.subCounters) {
          newValueObj.subArray = this.arrayitizeAndSort(valueObj.subCounters)
        }
      }
    }

    array.sort((a, b) => b.count - a.count)
    return array
  }

  /**
   * Generates a formatted response and recursively prints it to the response stream
   * @param arrayReport
   * @param stream
   * @param indent
   */
  printArrayReport(arrayReport: CounterArray, stream: Response, indent = 0): void {
    const indentText = '___'.repeat(indent)
    for (const item of arrayReport) {
      const { key, count, subArray } = item
      const countStr = `${count}`
      stream.write(`${countStr.padStart(10)} ${indentText} ${key}\n`)

      if (subArray != null && subArray.length > 0) {
        this.printArrayReport(subArray, stream, indent + 1)
      }
    }
  }

  resetCounters(): void {
    this.eventCounters = new Map()
  }
}

export const nestedCountersInstance = new NestedCounters()
export default NestedCounters
