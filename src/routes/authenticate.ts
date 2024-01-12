import * as jwt from 'jsonwebtoken'
import express from 'express'
export const router = express.Router()
import { CONFIG } from '../config'
import { Request, Response } from 'express'

router.route('/:passphrase').get(async function (req: Request, res: Response) {
  const { passphrase } = req.params
  const payload = { user: 'shardeum-dev' }
  if (passphrase === CONFIG.passphrase) {
    // token don't expire, usually this is bad practice
    // for the case being implementing refresh token is overkill
    // stolen token worst case scenario our debug data ended up being not useful.
    const token = jwt.sign(payload, CONFIG.secret_key)
    res.cookie('access_token', token, {
      httpOnly: false,
      maxAge: 1000 * 60 * 60 * 700, // ~ a month
    })
    return res.send({ token: token, message: 'authenticated and authorized for debug api calls' }).status(200)
  }
  return res.send({ message: 'wrong passphrase' }).status(400)
})

router.route('/token-check/:token').get(async function (req: Request, res: Response) {
  const { token } = req.params

  jwt.verify(token, CONFIG.secret_key, (err: Error | null) => {
    if (err) return res.status(401).send({ valid: false })
    return res.send({ valid: true }).status(200)
  })
})
