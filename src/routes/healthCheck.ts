import express, { Request, Response, Router } from 'express'
import { nestedCountersInstance } from '../utils/nestedCounters'

export const healthCheckRouter: Router = express.Router()

healthCheckRouter.get('/is-alive', (req: Request, res: Response) => {
  nestedCountersInstance.countEvent('endpoint', 'is-alive')
  return res.sendStatus(200)
})

healthCheckRouter.get('/is-healthy', (req: Request, res: Response) => {
  // TODO: Add actual health check logic
  nestedCountersInstance.countEvent('endpoint', 'health-check')
  return res.sendStatus(200)
})
