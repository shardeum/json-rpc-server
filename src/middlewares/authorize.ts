import { CONFIG } from '../config'
import * as jwt from 'jsonwebtoken'
import { NextFunction, Request, Response } from 'express'

const authorize = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.headers['authorization'] || req.cookies.access_token

  if (!token) {
    res.status(401).send({ message: 'No token provided' })
    return
  }

  jwt.verify(token, CONFIG.secret_key, (err: Error | null) => {
    if (err) {
      res.status(401).send({ message: 'unauthorized' })
      return // Ends execution here if there's an error
    }
    next() // Passes control to the next middleware if there's no error
  })
}

export default authorize
