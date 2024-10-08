import { Request, Response, NextFunction } from 'express'
import { CONFIG as config } from '../config'
const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  if (config.enableRequestLogger) {
    const reqTime = Date.now()
    const originalSend = res.send
    res.send = function (body) {
      const resTime = Date.now()
      const respTimeStamp = new Date(resTime).toISOString()
      const senderIp = req.ip
      const userAgent = req.headers['user-agent'] || 'Unknown'

      console.log(
        `RequestLogger:>> Request URL: ${req.originalUrl}` +
          ` Response Status Code: ${res.statusCode}` +
          ` Sender IP: ${senderIp}` +
          ` Request Timestamp: ${new Date(reqTime).toISOString()}` +
          ` Response Timestamp: ${respTimeStamp}` +
          ` Request Method: ${req.method}` +
          ` Response Time: ${resTime - reqTime}ms` +
          ` User Agent: ${userAgent}`
      )

      if (res.statusCode !== 200) {
        console.log(
          `RequestLogger:>> Request Body: ${JSON.stringify(req.body)}` +
            ` Response Body: ${JSON.stringify(body)}`
        )
      }
      return originalSend.call(this, body)
    }
  }
  next()
}
export default requestLogger
