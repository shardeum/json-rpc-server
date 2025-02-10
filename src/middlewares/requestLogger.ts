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
    // const userAgent = req.headers['user-agent'] || 'Unknown'

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

    res.on('finish', () => {
      logger.info({
        url: req.originalUrl,
        statusCode: res.statusCode,
        requestTimestamp: new Date(reqTime).toISOString(),
        responseTimestamp: new Date(Date.now()).toISOString(),
        responseTime: Date.now() - reqTime,
        request: req.body,
        response: JSON.parse(res.locals.responseBody),
      })

      const responseBody = res.locals.responseBody
      if (res.statusCode !== 200) {
        logger.error({
          message: 'RPC Request Failed',
          url: req.originalUrl,
          statusCode: res.statusCode,
          requestTimestamp: new Date(reqTime).toISOString(),
          responseTimestamp: new Date(Date.now()).toISOString(),
          responseTime: Date.now() - reqTime,
          request: req.body,
          response: JSON.parse(responseBody),
        })
      } else if (responseBody) {
        try {
          const parsedBody = JSON.parse(responseBody)
          if (parsedBody && 'error' in parsedBody) {
            logger.error(
              `RPC Request Failed with Error ||` +
                ` Request Body: ${JSON.stringify(req.body)} ||` +
                ` Response Body: ${res.locals.responseBody}`
            )
          }
        } catch (e) {
          // Silently fail if parsing fails, no logging here
        }
      }
    })
  }
  next()
}

export default requestLogger
