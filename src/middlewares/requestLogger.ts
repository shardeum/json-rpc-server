import { Request, Response, NextFunction } from 'express'
import { CONFIG as config } from '../config'
const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  if (config.enableRequestLogger) {
    const reqTime = Date.now()
    const originalSend = res.send
    const senderIp = req.ip
    const userAgent = req.headers['user-agent'] || 'Unknown'

    console.log(
      `RequestLogger:>> Request URL: ${req.originalUrl}` +
        ` Sender IP: ${senderIp}` +
        ` Request Timestamp: ${new Date(reqTime).toISOString()}` +
        ` User Agent: ${userAgent}`
    )

    res.send = function (body) {
      const resTime = Date.now()
      const respTimeStamp = new Date(resTime).toISOString()
      if (res.statusCode !== 200) {
        console.log(
          `RequestLogger:>>` +
            ` Response Timestamp: ${respTimeStamp}` +
            ` Request Method: ${req.method}` +
            ` Response Body: ${JSON.stringify(body)}`
        )
      }
      return originalSend.call(this, body)
    }
  }
  next()
}
export default requestLogger
