import {CONFIG} from '../config'
import * as jwt from 'jsonwebtoken'
import { NextFunction, Request, Response } from 'express'

const authorize = (req: Request, res: Response, next: NextFunction) => {
  jwt.verify(req.cookies.access_token, CONFIG.secret_key, (err: any) => {
    if (err) res.send({ message: 'unauthorized' }).status(403)
    next()
  })
  return
}

export default authorize
