import { Request, Response, NextFunction } from 'express'
const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const originalSend = res.send
  res.send = function (body) {
    if (res.statusCode !== 200) {
      console.log('RequestLogger:>> Request Method: ', req.method)
      console.log('RequestLogger:>> Request Body: ', req.body)
      console.log('RequestLogger:>> Response Status Code: ', res.statusCode)
      console.log('RequestLogger:>> Response Body: ', body)
    }
    return originalSend.call(this, body)
  }
  next()
}
export default requestLogger
