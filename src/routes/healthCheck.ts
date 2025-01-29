import express, { Request, Response, Router } from 'express'
import { nestedCountersInstance } from '../utils/nestedCounters'
import {checkDatabaseHealth} from "../storage/sqliteStorage";
import {CONFIG} from "../config";

export const healthCheckRouter: Router = express.Router()

healthCheckRouter.get('/is-alive', (req: Request, res: Response) => {
  nestedCountersInstance.countEvent('endpoint', 'is-alive')
  return res.sendStatus(200)
})

healthCheckRouter.get('/is-healthy', (req: Request, res: Response) => {
  const api_name = 'is-healthy'
  nestedCountersInstance.countEvent('endpoint', api_name)

  const dbHealthy = checkDatabaseHealth();
  const result = {
    status: dbHealthy ? 'healthy' : 'degraded',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: dbHealthy ? 'healthy' : 'unreachable',
    isServiceValidatorMode: CONFIG.serviceValidatorSourcing.enabled
  }

  return res.sendStatus(dbHealthy ? 200 : 500).json(result)
})
