const EventEmitter = require('events');

type LogData = {
    [key: string]: {
        count: number
        tMin: number
        tMax: number
        tTotal: number
        tAvg?: number
    }
}

type LogTicket = {
    [key: string]: {
        api_name: string
        start_timer: number
    }
}

export let logData: LogData = {}
export let logTicket: LogTicket = {}
export const logEventEmitter = new EventEmitter();

export function apiPefLogger(){
    console.log(`=> API PERF RESULTS`)
    for ( const [key, value] of Object.entries(logData)){
        const api = key
        const {  tMin, tMax, tTotal,  count } = value


        console.log(
            `Api: ${api},
            Count: ${count},
            Min: ${tMin.toFixed(3)} ms, 
            Max: ${tMax.toFixed(3)} ms,
            Total: ${tTotal.toFixed(3)} ms,
            Avg: ${tTotal/count} ms,
            Request per second: ${(count/process.uptime()).toFixed(3)} req/s`
        )
    }
    // clean up every set Interval
    logTicket = {}
}

