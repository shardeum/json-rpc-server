import { nestedCountersInstance } from './nestedCounters'

const cDefaultMin = 1e12
const cDefaultMinBig = BigInt(cDefaultMin)

const profilerSelfReporting = false

interface Profiler {
  sectionTimes: { [name: string]: SectionStat }
  // instance: Profiler
}

export const cNoSizeTrack = -2
export const cUninitializedSize = -1

type NumberStat = {
  total: number
  max: number
  min: number
  avg: number
  c: number
}

type BigNumberStat = {
  total: bigint
  max: bigint
  min: bigint
  avg: bigint
  c: number
}

type SectionStat = BigNumberStat & {
  name: string
  internal: boolean
  req: NumberStat
  resp: NumberStat
  start: bigint
  end: bigint
  started: boolean
  reentryCount: number
  reentryCountEver: number
}

// type TimesDataReport = {
//   name: string
//   minMs: number
//   maxMs: number
//   totalMs: number
//   avgMs: number
//   c: number
//   data: NumberStat | Record<string, unknown>
//   dataReq: NumberStat | Record<string, unknown>
// }

// type ScopedTimesDataReport = {
//   scopedTimes: TimesDataReport[]
//   cycle?: number
//   node?: string
//   id?: string
// }

export interface NodeLoad {
  internal: number
  external: number
}

class Profiler {
  sectionTimes: { [name: string]: SectionStat }
  scopedSectionTimes: { [name: string]: SectionStat }
  eventCounters: Map<string, Map<string, number>>
  stackHeight: number
  netInternalStackHeight: number
  netExternalStackHeight: number

  constructor() {
    console.log('profiler constructor')
    this.sectionTimes = {}
    this.scopedSectionTimes = {}
    this.eventCounters = new Map()
    this.stackHeight = 0
    this.netInternalStackHeight = 0
    this.netExternalStackHeight = 0
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    console.log('profiler constructor end')
  }

  profileSectionStart(sectionName: string, internal = false): void {
    // eslint-disable-next-line security/detect-object-injection
    let section = this.sectionTimes[sectionName]

    if (section != null && section.started === true) {
      if (profilerSelfReporting) nestedCountersInstance.countEvent('profiler-start-error', sectionName)
      return
    }

    if (section == null) {
      const t = BigInt(0)
      // The type assertion used below is done because we know that the remaining fields of SectionStat will be added to the section variable as the execution progresses.
      section = { name: sectionName, total: t, c: 0, internal } as SectionStat
      // eslint-disable-next-line security/detect-object-injection
      this.sectionTimes[sectionName] = section
    }

    section.start = process.hrtime.bigint()
    section.started = true
    section.c++

    if (internal === false) {
      nestedCountersInstance.countEvent('profiler', sectionName)

      this.stackHeight++
      if (this.stackHeight === 1) {
        this.profileSectionStart('_totalBusy', true)
        this.profileSectionStart('_internal_totalBusy', true)
      }
    }
  }

  profileSectionEnd(sectionName: string, internal = false): void {
    // eslint-disable-next-line security/detect-object-injection
    const section: SectionStat = this.sectionTimes[sectionName]
    if (section == null || section.started === false) {
      if (profilerSelfReporting) nestedCountersInstance.countEvent('profiler-end-error', sectionName)
      return
    }

    section.end = process.hrtime.bigint()
    section.total += section.end - section.start
    section.started = false

    if (internal === false) {
      if (profilerSelfReporting) nestedCountersInstance.countEvent('profiler-end', sectionName)

      this.stackHeight--
      if (this.stackHeight === 0) {
        this.profileSectionEnd('_totalBusy', true)
        this.profileSectionEnd('_internal_totalBusy', true)
      }
    }
  }

  scopedProfileSectionStart(sectionName: string, internal = false, messageSize: number = cNoSizeTrack): void {
    // eslint-disable-next-line security/detect-object-injection
    let section: SectionStat = this.scopedSectionTimes[sectionName]

    if (section != null && section.started === true) {
      section.reentryCount++
      section.reentryCountEver++
      return
    }

    console.log('section started', sectionName)
    if (section == null) {
      const t = BigInt(0)
      const max = BigInt(0)
      const min = cDefaultMinBig
      const avg = BigInt(0)
      section = {
        name: sectionName,
        total: t,
        max,
        min,
        avg,
        c: 0,
        internal,
        req: {
          total: 0,
          max: 0,
          min: cDefaultMin,
          avg: 0,
          c: 0,
        },
        resp: {
          total: 0,
          max: 0,
          min: cDefaultMin,
          avg: 0,
          c: 0,
        },
        start: t,
        end: t,
        started: false,
        reentryCount: 0,
        reentryCountEver: 0,
      }
      // eslint-disable-next-line security/detect-object-injection
      this.scopedSectionTimes[sectionName] = section
    }

    // update request size stats
    if (messageSize != cNoSizeTrack && messageSize != cUninitializedSize) {
      const stat = section.req
      stat.total += messageSize
      stat.c += 1
      if (messageSize > stat.max) stat.max = messageSize
      if (messageSize < stat.min) stat.min = messageSize
      stat.avg = stat.total / stat.c
    }

    section.start = process.hrtime.bigint()
    section.started = true
    section.c++
    console.log('section end', sectionName)
  }

  scopedProfileSectionEnd(sectionName: string, messageSize: number = cNoSizeTrack): void {
    // eslint-disable-next-line security/detect-object-injection
    const section = this.scopedSectionTimes[sectionName]
    if (section == null || section.started === false) {
      if (profilerSelfReporting) return
    }

    section.end = process.hrtime.bigint()

    const duration = section.end - section.start
    section.total += duration
    section.c += 1
    if (duration > section.max) section.max = duration
    if (duration < section.min) section.min = duration
    section.avg = section.total / BigInt(section.c)
    section.started = false

    //if we get a valid size let track stats on it
    if (messageSize != cNoSizeTrack && messageSize != cUninitializedSize) {
      const stat = section.resp
      stat.total += messageSize
      stat.c += 1
      if (messageSize > stat.max) stat.max = messageSize
      if (messageSize < stat.min) stat.min = messageSize
      stat.avg = stat.total / stat.c
    }
  }
}

export const profilerInstance = new Profiler()
export default Profiler
