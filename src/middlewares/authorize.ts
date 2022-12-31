import {CONFIG} from '../config'
import * as jwt from 'jsonwebtoken'

const authorize = (req: any, res: any, next: Function) => {
  jwt.verify(req.cookies.access_token, CONFIG.secret_key, (err: any) => {
    if (err) res.send({ message: 'unauthorized' }).status(403)
    next()
  })
  return
}

export default authorize
