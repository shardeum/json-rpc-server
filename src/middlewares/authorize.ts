import { CONFIG } from '../config'
import * as jwt from 'jsonwebtoken'
import { NextFunction, Request, Response } from 'express'


/**
 * Middleware function to authorize requests.
 * It checks for the presence of a valid JWT token in the request headers or cookies.
 * If the token is valid, it allows the request to proceed to the next middleware or route handler.
 * If the token is invalid or missing, it sends a 401 Unauthorized response.
 */
const authorize = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization']
  let token: any = authHeader

  token = token ? token : req.cookies.access_token

  jwt.verify(token, CONFIG.secret_key, (err: any) => {
    if (err) res.status(401).send({ message: 'unauthorized' })
    next()
  })
  return
}

export default authorize
