import { Request, Response, NextFunction } from 'express'
import { methods } from '../api'

const allowedMethods = Object.keys(methods)

export const methodWhitelist = (req: Request, res: Response, next: NextFunction) => {
  const body = req.body

  if (Array.isArray(body)) {
    // Handle batch requests
    const allMethodsAllowed = body.every(request => {
      const method = request?.method
      return method && allowedMethods.includes(method)
    })

    if (allMethodsAllowed) {
      return next()
    }
  } else {
    // Handle single requests
    const method = body?.method
    if (method && allowedMethods.includes(method)) {
      return next()
    }
  }

  return res.status(403).json({ error: 'Forbidden' })
}