import { db } from '../storage/sqliteStorage'
import express, { Request, Response } from 'express'
export const router = express.Router()
import { CONFIG } from '../config'
import { debug_info } from '../logger'

const timeInputProcessor = (timestamp: string): number => {
  const t = timestamp.includes('-') ? timestamp : parseInt(timestamp)
  return new Date(t).getTime()
}

type SQLFiltersParam = {
  start?: string | number
  end?: string | number
  id?: number
  hash?: string
  to?: string
  from?: string
  type?: string
  reason?: string
  injected?: boolean
  accepted?: number
  success?: boolean
  api_name?: string
  nodeUrl?: string
  ip?: string
}

interface QueryParams {
  page?: number
  max?: number
  start?: string | number
  end?: string | number
  nodeUrl?: string
  api_name?: string
  reason?: string
  hash?: string
  success?: boolean
}

type CustomRequest = Request & {
  query: QueryParams
}

interface Data {
  current?: number
  length: number
  max?: number
  prev?: number
  next?: number
  data?: unknown[]
}

const prepareSQLFilters = ({
  id,
  hash,
  to,
  from,
  type,
  reason,
  injected,
  accepted,
  success,
  api_name,
  nodeUrl,
  ip,
}: SQLFiltersParam): string => {
  let sql = ''
  // if(start && end) {
  //   sql += `AND timestamp between ${start} AND ${end} `
  // }
  if (id) {
    sql += `AND id = ${id} `
  }
  if (hash) {
    sql += `AND hash = ${hash} `
  }
  if (to) {
    sql += `AND [to]=${to} `
  }
  if (from) {
    sql += `AND [from] = ${from} `
  }
  if (type) {
    sql += `AND [type] = ${type} `
  }
  if (reason) {
    sql += `AND reason LIKE '%${reason}%' `
  }
  if (injected) {
    sql += `AND injected = ${injected} `
  }
  if (accepted) {
    sql += `AND accepted = ${accepted} `
  }
  if (success) {
    sql += `AND success = ${success} `
  }
  if (api_name) {
    sql += `AND api_name = ${api_name} `
  }
  if (nodeUrl) {
    sql += `AND nodeUrl=${nodeUrl} `
  }
  if (ip) {
    sql += `And ip = ${ip} `
  }
  return sql
}
router.route('/api-stats').get(async (req: CustomRequest, res: Response) => {
  try {
    const page = req.query.page || 0
    const max = req.query.max || 5000
    const cursor: number = page * max

    const start = req.query.start ? timeInputProcessor(req.query.start as string) : null
    const end = req.query.end ? timeInputProcessor(req.query.end as string) : null

    // start 1678037555727
    // end 1678038025945
    if (start && !end) {
      const tx = db.prepare(`SELECT * FROM interface_stats WHERE timestamp>${start} LIMIT 1`).all()
      return res.json(tx[0]).status(200)
    }
    if (!start && end) {
      // returns closet entry
      const tx = db
        .prepare(
          `SELECT *
                                FROM interface_stats
                                WHERE ABS(timestamp - ${end}) = (
                                  SELECT MIN(ABS(timestamp - ${end}))
                                  FROM interface_stats
                                )
                                LIMIT 1 OFFSET 0;`
        )
        .all()
      return res.json(tx[0]).status(200)
    }

    const sqlFilter = prepareSQLFilters({
      nodeUrl: req.query.nodeUrl,
      api_name: req.query.api_name,
      reason: req.query.reason,
      hash: req.query.hash,
      success: req.query.success,
    })

    const sqlString =
      sqlFilter == ''
        ? `SELECT * FROM interface_stats WHERE id > ${cursor} LIMIT ${max}`
        : `SELECT * FROM interface_stats WHERE id > ${0} ${sqlFilter}`

    // eslint-disable-next-line prefer-const
    const raw = db.prepare(sqlString).all()
    const data: Data = {
      current: Number(page),
      length: raw.length,
      max: max,
    }

    if (Number(page) > 0) {
      data.prev = Number(page) - 1
    }
    if (data.length >= max) {
      data.next = Number(page) + 1
    }

    if (sqlFilter != '') {
      delete data.current
      if (data.next) delete data.next
      if (data.prev) delete data.prev
    }
    data.data = raw
    return res.json(data).status(200)

    //   const raw = await db
    //     .prepare(`SELECT * FROM interface_stats WHERE timestamp BETWEEN ${start} AND ${end}`)
    //     .all()
    // const stats: any = {}
    // for (const entry of raw) {
    //   if (stats[entry.api_name]) {
    //     stats[entry.api_name].tFinals.push(entry.tfinal)
    //   } else {
    //     stats[entry.api_name] = {
    //       tMax: 0,
    //       tMin: 0,
    //       tAvg: 0,
    //       tTotal: 0,
    //       tFinals: [entry.tfinal],
    //     }
    //   }
    // }
    //
    // for (const api_name in stats) {
    //   /* eslint-disable security/detect-object-injection */
    //   stats[api_name].tFinals.sort()
    //   const length = stats[api_name].tFinals.length
    //   const index = length > 0 ? length - 1 : 0
    //   stats[api_name].tMax = stats[api_name].tFinals[index]
    //   stats[api_name].tMin = stats[api_name].tFinals[0]
    //   stats[api_name].count = length
    //
    //   for (const tfinal of stats[api_name].tFinals) {
    //     stats[api_name].tTotal += tfinal
    //   }
    //   stats[api_name].tAvg = stats[api_name].tTotal / stats[api_name].tFinals.length
    //   delete stats[api_name].tFinals
    //   /* eslint-enable security/detect-object-injection */
    // }
    // const info = {
    //   date: {
    //     start: new Date(start).toString(),
    //     end: new Date(end).toString(),
    //   },
    //   stats: stats,
    // }
    // return res.json(info).status(200)
  } catch (e) {
    console.log(e)
    return res.json(e).status(500)
  }
})

router.route('/cleanStatTable').get(async (req: Request, res: Response) => {
  try {
    await db.exec('DELETE FROM interface_stats')
    debug_info.interfaceDB_cleanTime = Date.now()
    res.send({ success: true }).status(200)
  } catch (e: unknown) {
    res.send(e).status(500)
  }
})

router.route('/txs').get(async function (req: Request, res: Response) {
  try {
    // this is a very bad security practice !
    // Not enough input sanitization :(
    // Exposed Primary keys :(
    // Should be ok though as long as this endpoint is private and only for debug
    const page = Number(req.query.page) || 0
    const max = Number(req.query.max) || 1000
    const cursor: number = page * max
    const start = req.query.start ? timeInputProcessor(req.query.start as string) : null
    const end = req.query.end ? timeInputProcessor(req.query.end as string) : null

    if (start && !end) {
      const tx = db.prepare(`SELECT * FROM transactions WHERE timestamp>${start} LIMIT 1`).all()
      return res.json(tx[0]).status(200)
    }
    if (!start && end) {
      // returns closet entry
      const tx = db
        .prepare(
          `SELECT *
                                FROM transactions
                                WHERE ABS(timestamp - ${end}) = (
                                  SELECT MIN(ABS(timestamp - ${end}))
                                  FROM transactions
                                )
                                LIMIT 1 OFFSET 0;`
        )
        .all()
      return res.json(tx[0]).status(200)
    }

    const sqlFilter = prepareSQLFilters({
      nodeUrl: req.query.nodeUrl as string,
      type: req.query.type as string,
      reason: req.query.reason as string,
      injected: req.query.injected === 'true' ? true : req.query.injected === 'false' ? false : undefined,
      ip: req.query.ip as string,
      to: req.query.to as string,
      from: req.query.from as string,
      hash: req.query.hash as string,
    })

    const sqlString =
      sqlFilter == ''
        ? `SELECT * FROM transactions WHERE id > ${cursor} LIMIT ${max}`
        : `SELECT * FROM transactions WHERE id > ${0} ${sqlFilter}`

    // eslint-disable-next-line prefer-const
    const txs = db.prepare(sqlString).all()

    const data: Data = {
      current: Number(page),
      length: txs.length,
    }

    if (Number(page) > 0) {
      data.prev = Number(page) - 1
    }
    if (data.length >= max) {
      data.next = Number(page) + 1
    }
    data.data = txs

    if (sqlFilter != '') {
      delete data.current
      if (data.next) delete data.next
      if (data.prev) delete data.prev
    }
    return res.json(data).status(200)
  } catch (e: unknown) {
    console.log(e)
    if (e instanceof Error) {
      res.send(e.message).status(500)
    } else {
      res.send('An error occurred').status(500)
    }
  }
})

router.route('/cleanTxTable').get(async function (req: Request, res: Response) {
  try {
    await db.exec('DELETE FROM transactions')
    debug_info.txDB_cleanTime = Date.now()
    res.send({ success: true }).status(200)
  } catch (e: unknown) {
    if (e instanceof Error) {
      res.send(e.message).status(500)
    } else {
      res.send('An unexpected error occurred').status(500)
    }
  }
})

router.route('/startTxCapture').get(async function (req: Request, res: Response) {
  if (CONFIG.recordTxStatus) return res.json({ message: 'Tx recording already enabled' }).status(304)
  debug_info.txRecordingStartTime = Date.now()
  debug_info.txRecordingEndTime = 0
  CONFIG.recordTxStatus = true

  res.json({ message: 'Transaction status recording enabled' }).status(200)
})
router.route('/stopTxCapture').get(async function (req: Request, res: Response) {
  if (!CONFIG.recordTxStatus) return res.json({ message: 'Tx recording already stopped' }).status(304)
  debug_info.txRecordingEndTime = Date.now()
  CONFIG.recordTxStatus = false
  res.send({ message: 'Transaction status recording disabled' }).status(200)
})

router.route('/startRPCCapture').get(async function (req: Request, res: Response) {
  if (CONFIG.statLog) {
    return res.json({ message: 'Interface stats are recording recording already' }).status(304)
  }
  debug_info.interfaceRecordingStartTime = Date.now()
  debug_info.interfaceRecordingEndTime = 0
  CONFIG.statLog = true

  res.json({ message: 'RPC interface recording enabled' }).status(200)
})
router.route('/stopRPCCapture').get(async function (req: Request, res: Response) {
  if (!CONFIG.statLog) {
    return res.json({ message: 'Interface stats recording already stopped' }).status(304)
  }
  debug_info.interfaceRecordingEndTime = Date.now()
  CONFIG.statLog = false
  res.json({ message: 'RPC interface recording disabled' }).status(200)
})

router.route('/status').get(async function (req: Request, res: Response) {
  debug_info.isRecordingTx = CONFIG.recordTxStatus
  debug_info.isRecordingInterface = CONFIG.statLog
  res.json(debug_info).status(200)
})
