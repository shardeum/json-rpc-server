
import { ServicePointTypes, CONFIG as config } from '../config'
import { nestedCountersInstance } from '../utils/nestedCounters'

export const servicePointSpendHistory: { points: number; ts: number }[] = []

//let debugLastTotalServicePoints = 0

export function trySpendServicePoints(key: ServicePointTypes): boolean {
    
    /* eslint-disable security/detect-object-injection */
    const pointsCost = config.ServicePoints[key]
    if(pointsCost === undefined){
        return false
    }

    const nowTs = Date.now()
    const maxAge = 1000 * config.ServicePointsInterval
    const maxAllowedPoints = config.ServicePointsPerSecond * config.ServicePointsInterval
    let totalPoints = 0
    //remove old entries, count points
    for (let i = servicePointSpendHistory.length - 1; i >= 0; i--) {
      const entry = servicePointSpendHistory[i] // eslint-disable-line security/detect-object-injection
      const age = nowTs - entry.ts
      //if the element is too old remove it
      if (age > maxAge) {
        servicePointSpendHistory.pop()
      } else {
        totalPoints += entry.points
      }
    }
  
    //debugLastTotalServicePoints = totalPoints
  
    //is the new operation too expensive?
    if (totalPoints + pointsCost > maxAllowedPoints) {
      nestedCountersInstance.countEvent('service-points', 'fail: not enough points available to spend')
      nestedCountersInstance.countEvent('service-points', 'fail: not enough points available to spend:' + key)
      return false
    }
  
    //Add new entry to array
    const newEntry = { points:pointsCost, ts: nowTs }
    servicePointSpendHistory.unshift(newEntry)
  
    nestedCountersInstance.countEvent('service-points', 'pass: points available to spend')
    return true
  }