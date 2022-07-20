const EventEmitter = require('events');
const config = require('./config.json');

type ApiPerfLogData = {
    [key: string]: {
        count: number
        tMin: number
        tMax: number
        tTotal: number
        tAvg?: number
    }
}

type ApiPerfLogTicket = {
    [key: string]: {
        api_name: string
        start_timer: number
    }
}

export const mutedEvents: any = {
    on: () => {
        console.log("=> Logging is disabled")
    },
    emit: () => {}
}

export let apiPerfLogData: ApiPerfLogData = {}
export let apiPerfLogTicket: ApiPerfLogTicket = {}
export const logEventEmitter = config.statLog ? new EventEmitter() : mutedEvents;

export function apiPefLogger(){
    console.log(`=> API PERF RESULTS`)
    for ( const [key, value] of Object.entries(apiPerfLogData)){
        const api = key
        const {  tMin, tMax, tTotal,  count } = value


        console.log(
            `Api: ${api},
            Count: ${count},
            Min: ${tMin.toFixed(3)} ms, 
            Max: ${tMax.toFixed(3)} ms,
            Total: ${tTotal.toFixed(3)} ms,
            Avg: ${(tTotal/count).toFixed(3)} ms,
            Request per second: ${(count/process.uptime()).toFixed(3)} req/s`
        )
    }
    // clean up every set Interval
    console.log(apiPerfLogTicket)
    apiPerfLogTicket = {}
}

export function setupLogEvents () {
    logEventEmitter.on('fn_start', (ticket: string, api_name: string, start_timer: number) => {

      apiPerfLogTicket[ticket] = {
        api_name: api_name,
        start_timer: start_timer
      }
    })

    logEventEmitter.on('fn_end', (ticket: string, end_timer: number) => {

      if (!apiPerfLogTicket.hasOwnProperty(ticket)) return

      const {api_name, start_timer} = apiPerfLogTicket[ticket]
      // tfinal is the time it took to complete an api
      const tfinal = end_timer - start_timer;
      if (apiPerfLogData.hasOwnProperty(api_name)) {

        apiPerfLogData[api_name].count += 1
        apiPerfLogData[api_name].tTotal += tfinal

        const tMin = apiPerfLogData[api_name].tMin
        const tMax = apiPerfLogData[api_name].tMax

        apiPerfLogData[api_name].tMin = (tfinal < tMin) ? tfinal : tMin
        apiPerfLogData[api_name].tMax = (tfinal > tMax) ? tfinal : tMax

      }
      if (!apiPerfLogData.hasOwnProperty(api_name)) {
        apiPerfLogData[api_name] = {
          count: 1,
          tMin: tfinal,
          tMax: tfinal,
          tTotal: tfinal,
        }
      }
      delete apiPerfLogTicket[ticket]
    })
}
