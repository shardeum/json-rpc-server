import {CONFIG} from '../config'
import * as jwt from 'jsonwebtoken'
import { NextFunction, Request, Response } from 'express'

const authorize = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization']
  let token: any = authHeader

  token = token? token : req.cookies.access_token

  jwt.verify(token , CONFIG.secret_key, (err: any) => {
    if (err) res.status(401).send({ message: 'unauthorized' })
    next()
  })
  return
}

export default authorize
