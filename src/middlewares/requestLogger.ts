import { Request, Response, NextFunction } from 'express'
import { CONFIG as config } from '../config'
import createLogger from '../utils/logger'

const logger = createLogger({
  enableConsole: process.env.NODE_ENV !== 'production',
  enableFile: process.env.NODE_ENV === 'production',
  filename: 'logs/requests.log',
})

const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  if (config.enableRequestLogger) {
    const reqTime = Date.now()
    const userAgent = req.headers['user-agent'] || 'Unknown'

    const responseChunks: Buffer[] = []

    const originalWrite = res.write.bind(res)
    res.write = function (
      chunk: any,
      encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void),
      callback?: (error: Error | null | undefined) => void
    ) {
      responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))

      if (typeof encodingOrCallback === 'function') {
        return originalWrite(chunk, encodingOrCallback)
      } else {
        return originalWrite(chunk, encodingOrCallback as BufferEncoding, callback)
      }
    }

    const originalEnd = res.end.bind(res)
    res.end = function (chunk?: any, ...args: any[]) {
      const responseBody = Buffer.concat(responseChunks).toString('utf8')
      res.locals.responseBody = responseBody
      return originalEnd(chunk, ...args)
    }

    const originalJson = res.json.bind(res)
    res.json = function (body) {
      res.locals.responseBody = body
      return originalJson(body)
    }

    const originalSend = res.send.bind(res)
    res.send = function (body) {
      res.locals.responseBody = body
      return originalSend(body)
    }

    res.once('finish', () => {
      try {
        const responseBody = JSON.parse(res.locals.responseBody)
        logger[responseBody.result ? 'info' : 'error']({
          type: 'request',
          url: req.originalUrl,
          userAgent,
          statusCode: res.statusCode,
          requestTimestamp: new Date(reqTime).toISOString(),
          responseTimestamp: new Date(Date.now()).toISOString(),
          responseTime: Date.now() - reqTime,
          request: req.body,
          response: responseBody,
        })
      } catch (e) {
        logger.error({
          type: 'request',
          message: 'Failed to parse response body',
        })
      }
    })
  }
  next()
}

export default requestLogger
